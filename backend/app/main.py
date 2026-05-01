from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, status, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
from passlib.context import CryptContext
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
import uuid
import os
import logging
import jwt
import io
import csv
import easyocr
import numpy as np
import cv2
from sentence_transformers import SentenceTransformer
from scipy.spatial.distance import cosine
from pdf2image import convert_from_bytes
from openpyxl import Workbook
import re
import zipfile          # ← NEW: for folder/zip bulk upload
import httpx            # ← NEW: for free Gemini API calls

# Configuration
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'evalmate')]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-this')
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRATION = int(os.environ.get('JWT_EXPIRATION_HOURS', '168'))

# ── FREE Groq API key (add GROQ_API_KEY= to your .env) ──────────────────────
# Get free at: https://console.groq.com  (no credit card needed)
# Free tier: 14,400 requests/day, 30 req/min — no daily quota exhaustion issues
# Groq runs open-source LLMs (llama-3) at very high speed for free.
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
# Also keep Gemini as backup if user has both keys
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"   # fast, free, good at structured JSON output

# Security
security = HTTPBearer()

# Global AI services
ocr_reader = None
embedding_model = None

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    global ocr_reader, embedding_model
    
    logger.info("Initializing EasyOCR...")
    try:
        ocr_reader = easyocr.Reader(['en'], gpu=False)
        logger.info("EasyOCR initialized")
    except Exception as e:
        logger.error(f"Failed to initialize EasyOCR: {e}")
    
    logger.info("Loading Sentence Transformer model...")
    try:
        embedding_model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2', device='cpu')
        logger.info("Sentence Transformer loaded")
    except Exception as e:
        logger.error(f"Failed to load Sentence Transformer: {e}")
    
    yield
    
    logger.info("Shutting down...")
    client.close()

# Create FastAPI app
app = FastAPI(
    title="EvalMate API",
    description="AI-Assisted Academic Evaluation System",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Configuration
origins = [
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Create API router
api_router = APIRouter(prefix="/api")

# ==================== PYDANTIC MODELS ====================

class FacultySignup(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=1)
    faculty_id: str
    department: str

class FacultyLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    faculty: Dict[str, Any]

class AssignmentCreate(BaseModel):
    assignment_name: str
    subject: str
    date: str
    maximum_marks: float

class AssignmentUpdate(BaseModel):
    assignment_name: Optional[str] = None
    subject: Optional[str] = None
    date: Optional[str] = None
    maximum_marks: Optional[float] = None

class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    marks: Optional[float] = None
    word_limit: Optional[int] = None

class RubricConcept(BaseModel):
    description: str = Field(..., min_length=5)
    marks: float = Field(..., gt=0)

class RubricCreate(BaseModel):
    question_id: str
    concepts: List[RubricConcept]

# ==================== HELPER FUNCTIONS ====================

def clean_mongo_doc(doc: dict) -> dict:
    """Remove MongoDB _id field from document"""
    if doc and '_id' in doc:
        doc.pop('_id')
    return doc

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_faculty(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        faculty_id = payload.get("faculty_id")
        if not faculty_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        faculty = await db.faculty.find_one({"id": faculty_id}, {"_id": 0})
        if not faculty:
            raise HTTPException(status_code=401, detail="Faculty not found")
        return faculty
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ═══════════════════════════════════════════════════════════
# FIX 1 ── SAP ID / filename parser for bulk upload
# ═══════════════════════════════════════════════════════════

def parse_sapid_filename(filename: str) -> tuple[str, str]:
    """
    Extract (sap_id, student_name) from a filename like:
      500120443_AryanRaj.pdf  →  ('500120443', 'AryanRaj')
      500120443_Aryan Raj.pdf →  ('500120443', 'Aryan Raj')
      500120443AryanRaj.pdf   →  ('500120443', 'AryanRaj')   ← no underscore fallback

    Rules:
    - SAP ID = leading digit sequence (8-10 digits)
    - Name   = everything after the first _ (or after the digit run)
    - Strip extension before parsing
    """
    stem = Path(filename).stem  # drop .pdf / .jpg etc.

    # Primary: digits_Name
    m = re.match(r'^(\d{6,12})[_\-\s]+(.+)$', stem)
    if m:
        return m.group(1).strip(), m.group(2).strip()

    # Fallback: leading digits directly followed by letters (no separator)
    m = re.match(r'^(\d{6,12})([A-Za-z].*)$', stem)
    if m:
        return m.group(1).strip(), m.group(2).strip()

    # Cannot parse — return whole stem as name, empty sap_id
    return "", stem


# ═══════════════════════════════════════════════════════════
# FIX 3 ── Mark standardisation  (whole or 0.5 only)
# ═══════════════════════════════════════════════════════════

def standardise_marks(raw: float) -> float:
    """
    Round marks to nearest 0.5 the way a faculty would:
      13.19 → 13.0
      13.34 → 13.5
      13.75 → 14.0
    Never returns a value like 13.19 or 7.33.
    """
    return round(raw * 2) / 2


def _apply_word_limit_penalty(marks: float, max_marks: float, word_count: int, word_limit: int) -> float:
    """
    Apply a graduated mark reduction when the student answer is under the word limit.
    The penalty is intentionally lenient — within 90% of the limit counts as full compliance.
    Over the limit → no penalty at all.

    Ratio tiers:
      >= 0.90  → no penalty  (e.g., limit=50, count=45+)
      0.70-0.89 → reduce ~15%
      0.50-0.69 → reduce ~30%
      0.30-0.49 → reduce ~50%
      < 0.30    → reduce ~70%
    """
    if word_limit is None or word_limit <= 0:
        return marks
    if word_count >= word_limit:
        return marks  # over limit → no penalty

    ratio = word_count / word_limit

    if ratio >= 0.90:
        penalty = 0.0
    elif ratio >= 0.70:
        penalty = 0.15
    elif ratio >= 0.50:
        penalty = 0.30
    elif ratio >= 0.30:
        penalty = 0.50
    else:
        penalty = 0.70

    reduced = marks * (1.0 - penalty)
    return standardise_marks(max(reduced, 0.0))


# ═══════════════════════════════════════════════════════════
# SIMILARITY ENGINE — Hybrid semantic + keyword + Gemini
# ═══════════════════════════════════════════════════════════

_STOPWORDS = {
    'a','an','the','is','are','was','were','be','been','being',
    'have','has','had','do','does','did','will','would','could',
    'should','may','might','shall','and','or','but','in','on',
    'at','to','for','of','with','by','from','as','that','this',
    'these','those','it','its','etc','use','using','used',
    'can','we','i','they','them','their','when','how','what','why',
    'such','also','like','which','where','if','then','so','both',
    'each','all','more','very','well','just','about','up','out',
    'there','than','other','into','through','during','give','two',
    'e','g','k','or','similar','valid','equivalent','following',
    'real','world','example','examples','explain','describe','define',
    'technique','definition','concept','prevention'
}


def _normalize_word(w: str) -> str:
    for suffix in ('ization','isation','ation','tion','ing','ness',
                   'ment','ity','ive','ical','tion','ed','er','ly','ion'):
        if w.endswith(suffix) and len(w) - len(suffix) > 3:
            return w[:-len(suffix)]
    return w


def _clean_rubric_for_matching(concept: str) -> str:
    c = concept
    c = re.sub(r'\([^)]*\)', '', c)
    stripped = re.sub(r'^[^:]{1,50}:\s*', '', c.strip())
    if len(stripped) > 5:
        c = stripped
    c = c.replace(';', ' ')
    c = re.sub(r'\s+', ' ', c).strip().rstrip('.,;')
    return c


def _key_terms(text: str) -> set:
    cleaned = re.sub(r'[^a-zA-Z0-9 ]', ' ', text.lower())
    return {_normalize_word(w) for w in cleaned.split()
            if w not in _STOPWORDS and len(w) > 2}


def _keyword_score(student_text: str, clean_concept: str) -> float:
    concept_terms = _key_terms(clean_concept)
    answer_terms  = _key_terms(student_text)

    if not concept_terms:
        return 0.0

    overlap_ratio = len(concept_terms & answer_terms) / len(concept_terms)
    if overlap_ratio == 0:
        return 0.0

    answer_meaningful_words = len(answer_terms)
    MIN_WORDS_FOR_FULL_CREDIT = 5

    if answer_meaningful_words < MIN_WORDS_FOR_FULL_CREDIT:
        length_factor = answer_meaningful_words / MIN_WORDS_FOR_FULL_CREDIT
    else:
        length_factor = 1.0

    score = overlap_ratio * length_factor
    return min(score * 0.85, 0.85)


def _fine_grained_chunks(text: str) -> list:
    chunks = []
    sentences = [s.strip() for s in re.split(r'[.!?;\n]', text) if s.strip()]

    for sent in sentences:
        if ':' in sent:
            after = sent.split(':', 1)[1].strip()
            if len(after) > 5:
                sent = after

        items = [x.strip() for x in sent.split(',') if len(x.strip()) > 4]
        if len(items) > 1:
            chunks.extend(items)
            chunks.append(sent)
        else:
            chunks.append(sent)

    chunks.append(text.strip())
    return list({c for c in chunks if len(c) > 4})


# ═══════════════════════════════════════════════════════════
# FIX 2 ── FREE Gemini fallback for open/example questions
# ═══════════════════════════════════════════════════════════

def _needs_llm_scoring(concept_description: str) -> bool:
    """
    Returns True when the rubric concept benefits from LLM scoring instead of
    pure semantic similarity alone.  This covers:
      - Example/open-ended concepts (student picks their own example)
      - Difference/comparison concepts (student may phrase differently)

    WHY THIS MATTERS:
    LLM is called (and costs a rate-limit token) only for these concepts.
    Definitions, techniques, and straightforward explanations use local
    semantic similarity only — which works well for them.

    LLM-SCORED concepts:
      "Real-world example: email spam classification (or similar)"
      "Give a real-world application such as fraud detection"
      "Difference 1: Supervised uses labeled data, unsupervised does not"
      "Differentiate between TCP and UDP"

    LOCAL-ONLY concepts:
      "Prevention technique 1: Cross-validation (e.g., k-fold)"
      "Definition: Supervised learning uses labeled data..."
      "Bias: Error due to wrong assumptions..."
    """
    lower = concept_description.lower().strip()

    # ── Hard negatives: starts with a known definition/technique label ──
    negative_starts = (
        'definition', 'prevention technique', 'training set purpose',
        'testing set purpose', 'general purpose', 'bias:', 'variance:',
        'tradeoff', 'overfitting definition',
        'purpose:', 'technique:', 'supervised learning', 'unsupervised learning',
    )
    for neg in negative_starts:
        if lower.startswith(neg):
            return False

    # "(e.g., x)" used as inline clarification inside a technique concept —
    # NOT asking the student to supply an example
    if re.search(r'\(e\.g\.', lower):
        if 'real-world example' not in lower and 'or similar' not in lower:
            return False

    # "based on examples" — examples appear in explanation, not as a prompt
    if 'based on examples' in lower and 'real-world example' not in lower:
        return False

    # ── Strong positives: examples ──
    example_positives = [
        'real-world example', 'real world example',
        'or similar',           # "(or similar valid example)"
        'any valid',            # "any valid example"
        'any correct',
        'give an example', 'provide an example',
        'name an example', 'state an example', 'cite an example',
        'such as',              # "an application such as..."
        'use case',
    ]
    if any(p in lower for p in example_positives):
        return True

    # Concept label itself starts with "example" or "real-world"
    if lower.startswith('example:') or lower.startswith('real-world'):
        return True

    # ── Strong positives: difference/comparison concepts ──
    # Students may phrase differences very differently from rubric text,
    # so LLM scoring helps judge semantic equivalence.
    difference_positives = [
        'difference 1', 'difference 2', 'difference 3',
        'difference 4', 'difference 5',
        'difference:', 'key difference',
        'differentiate', 'distinguish',
        'compare and contrast', 'comparison:',
    ]
    if any(p in lower for p in difference_positives):
        return True

    # Starts with "difference" (catches "Difference between X and Y")
    if lower.startswith('difference'):
        return True

    return False


# ── LLM scorer: Groq (primary, free) + Gemini (fallback) ────────────────────
# Groq free tier: 30 req/min, 14,400 req/day — much more generous than Gemini.
# Gemini kept as fallback if user has that key and not Groq.
# Rate limiter: Groq allows 30/min so we need ~2s gap minimum (use 2.5s to be safe).
import asyncio as _asyncio
import time as _time

_LLM_INTERVAL = 2.5          # seconds between LLM calls (safe for 30 req/min Groq limit)
_llm_sem: "_asyncio.Semaphore | None" = None
_llm_last: float = 0.0

def _get_llm_sem():
    global _llm_sem
    if _llm_sem is None:
        _llm_sem = _asyncio.Semaphore(1)
    return _llm_sem

async def _llm_wait():
    """Serialise LLM calls and enforce minimum interval between them."""
    global _llm_last
    sem = _get_llm_sem()
    await sem.acquire()
    try:
        now     = _time.monotonic()
        elapsed = now - _llm_last
        if elapsed < _LLM_INTERVAL:
            await _asyncio.sleep(_LLM_INTERVAL - elapsed)
        _llm_last = _time.monotonic()
    finally:
        sem.release()


_EVAL_PROMPT_TEMPLATE = (
    "You are a strict but fair academic evaluator grading a student exam.\n"
    "Decide if the student answer satisfies the rubric concept below.\n\n"
    "RUBRIC CONCEPT:\n{concept}\n\n"
    "STUDENT ANSWER:\n{answer}\n\n"
    "RULES:\n"
    "- Accept ANY correct real-world example even if different from rubric.\n"
    "- Accept correct paraphrases and synonyms.\n"
    "- Give 0.0 if completely wrong or blank.\n"
    "- Give 1.0 only if clearly and correctly addressed.\n"
    "Respond with ONLY valid JSON, no extra text:\n"
    "{{\"score\": 0.85, \"reason\": \"brief reason\"}}"
)


async def _groq_score(student_answer: str, concept_description: str) -> float | None:
    """
    Call Groq API (free, 30 req/min, 14,400/day) to score an example/open concept.
    Uses llama3-8b-8192 — fast and accurate for short structured outputs.

    Get free key at: https://console.groq.com
    Add to .env: GROQ_API_KEY=gsk_...
    """
    if not GROQ_API_KEY:
        return None

    prompt = _EVAL_PROMPT_TEMPLATE.format(
        concept=concept_description.strip(),
        answer=student_answer.strip()[:800]   # cap to avoid token waste
    )

    try:
        await _llm_wait()

        async with httpx.AsyncClient(timeout=20.0) as ch:
            resp = await ch.post(
                GROQ_URL,
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": GROQ_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 80,
                    "response_format": {"type": "json_object"}
                }
            )

        if resp.status_code == 200:
            data     = resp.json()
            raw_text = data["choices"][0]["message"]["content"].strip()
            parsed   = __import__("json").loads(raw_text)
            score    = float(parsed.get("score", 0))
            logger.info(f"Groq score {score:.2f} — {parsed.get('reason','')}")
            return max(0.0, min(1.0, score))

        elif resp.status_code == 429:
            logger.warning("Groq 429 — rate limit hit, falling back to local score")
            return None

        else:
            logger.warning(f"Groq API error {resp.status_code}: {resp.text[:200]}")
            return None

    except Exception as e:
        logger.warning(f"Groq call failed: {e}")
        return None


async def _gemini_score(student_answer: str, concept_description: str) -> float | None:
    """
    Gemini fallback (only used if GROQ_API_KEY is not set but GEMINI_API_KEY is).
    """
    if not GEMINI_API_KEY:
        return None

    prompt = _EVAL_PROMPT_TEMPLATE.format(
        concept=concept_description.strip(),
        answer=student_answer.strip()[:800]
    )

    try:
        await _llm_wait()

        async with httpx.AsyncClient(timeout=20.0) as ch:
            resp = await ch.post(
                f"{GEMINI_URL}?key={GEMINI_API_KEY}",
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.1, "maxOutputTokens": 80}
                }
            )

        if resp.status_code == 200:
            data     = resp.json()
            raw_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            raw_text = re.sub(r'^```[a-z]*\n?', '', raw_text)
            raw_text = re.sub(r'\n?```$', '', raw_text).strip()
            parsed   = __import__('json').loads(raw_text)
            score    = float(parsed.get("score", 0))
            logger.info(f"Gemini score {score:.2f} — {parsed.get('reason','')}")
            return max(0.0, min(1.0, score))

        elif resp.status_code == 429:
            logger.warning("Gemini 429 — quota exceeded, using local semantic score")
            return None

        else:
            logger.warning(f"Gemini API error {resp.status_code}: {resp.text[:200]}")
            return None

    except Exception as e:
        logger.warning(f"Gemini call failed: {e}")
        return None


def compute_semantic_similarity(text1: str, text2: str) -> float:
    """
    Sync wrapper — returns similarity; Gemini is async so it won't be called here.
    Use compute_similarity_async for the evaluation pipeline.

    LENGTH FAIRNESS:
    Very short answers (e.g. "Supervised learning is when you have input and output")
    should never score high just because they share a few keywords with a long rubric concept.
    A correct definition requires substance. We apply a length penalty:
    - Count meaningful words in the student answer
    - If < MIN_ANSWER_WORDS, cap the semantic score proportionally
    - This means a 3-word answer can't score more than ~30% no matter how similar
    """
    try:
        clean_concept = _clean_rubric_for_matching(text2)
        if not clean_concept:
            clean_concept = text2

        # ── Length penalty ──────────────────────────────────────────────────
        # Count meaningful words in the answer (exclude stopwords)
        answer_meaningful = _key_terms(text1)
        answer_word_count = len(answer_meaningful)
        MIN_ANSWER_WORDS  = 10   # A real definition/answer needs at least 10 meaningful words
        if answer_word_count < MIN_ANSWER_WORDS:
            # Scale: 0 words → 0.0 cap,  5 words → 0.35 cap,  10 words → 1.0 cap
            length_cap = (answer_word_count / MIN_ANSWER_WORDS) * 0.7
        else:
            length_cap = 1.0

        # ── Exact substring match (only if answer is long enough) ──────────
        if length_cap >= 0.7 and clean_concept.lower() in text1.lower():
            return min(0.9, length_cap)

        chunks = _fine_grained_chunks(text1)

        if not chunks:
            emb1 = embedding_model.encode(text1, normalize_embeddings=True)
            emb2 = embedding_model.encode(clean_concept, normalize_embeddings=True)
            semantic_best = float(1 - cosine(emb1, emb2))
        else:
            chunk_embs = embedding_model.encode(chunks, normalize_embeddings=True)
            emb2       = embedding_model.encode(clean_concept, normalize_embeddings=True)
            sims = [float(1 - cosine(ce, emb2)) for ce in chunk_embs]
            semantic_best = max(sims)

        kw_scores = [_keyword_score(chunk, clean_concept) for chunk in chunks]
        kw_score = max(kw_scores) if kw_scores else 0

        # Keyword direct hit boost — but only if answer has enough length
        concept_terms = _key_terms(clean_concept)
        direct_hit = concept_terms & answer_meaningful
        if direct_hit and length_cap >= 0.5:
            semantic_best = max(semantic_best, 0.35)

        final = max(semantic_best, kw_score)

        # ── Apply length cap ────────────────────────────────────────────────
        final = min(final, length_cap)

        return float(np.clip(final, 0, 1))

    except Exception as e:
        logger.error(f"Error computing similarity: {e}")
        return 0.5


async def compute_similarity_async(student_answer: str, concept_description: str) -> float:
    """
    Standard scoring: semantic for definitions, LLM for examples & differences.
    Returns a single combined score (existing behavior — used for total_marks).
    """
    local_score = compute_semantic_similarity(student_answer, concept_description)

    if _needs_llm_scoring(concept_description):
        llm_score = None
        if GROQ_API_KEY:
            llm_score = await _groq_score(student_answer, concept_description)
        if llm_score is None and GEMINI_API_KEY and not GROQ_API_KEY:
            llm_score = await _gemini_score(student_answer, concept_description)
        if llm_score is not None:
            final = max(local_score, llm_score)
            logger.info(f"LLM-scored concept — local={local_score:.2f}, llm={llm_score:.2f}, final={final:.2f}")
            return float(np.clip(final, 0, 1))

    return local_score


async def compute_llm_score_for_concept(student_answer: str, concept_description: str) -> float:
    """
    Full LLM scoring for ANY concept type (not just examples).
    Used for the dual-assessment feature so faculty can compare
    pure-LLM marks vs semantic marks side by side.
    Falls back to semantic if no LLM key is configured.
    """
    llm_score = None
    if GROQ_API_KEY:
        llm_score = await _groq_score(student_answer, concept_description)
    if llm_score is None and GEMINI_API_KEY:
        llm_score = await _gemini_score(student_answer, concept_description)
    if llm_score is not None:
        return float(np.clip(llm_score, 0, 1))
    # No LLM available — fall back to semantic
    return compute_semantic_similarity(student_answer, concept_description)


def _similarity_to_marks_pct(similarity: float) -> float:
    """Convert raw cosine similarity score to a fair marks percentage."""
    breakpoints = [
        (0.85, 0.97),
        (0.75, 0.88),
        (0.65, 0.75),
        (0.55, 0.58),
        (0.45, 0.40),
        (0.35, 0.22),
        (0.25, 0.08),
        (0.00, 0.00),
    ]
    for i in range(len(breakpoints) - 1):
        hi_sim, hi_pct = breakpoints[i]
        lo_sim, lo_pct = breakpoints[i + 1]
        if similarity >= lo_sim:
            t = (similarity - lo_sim) / (hi_sim - lo_sim) if hi_sim != lo_sim else 1.0
            return lo_pct + t * (hi_pct - lo_pct)
    return 0.0

def extract_text_from_image(image_bytes: bytes) -> str:
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        results = ocr_reader.readtext(thresh, detail=0, paragraph=True)
        return " ".join(results)
    except Exception as e:
        logger.error(f"Error extracting text: {e}")
        return ""

def extract_questions_from_text(text: str) -> List[Dict[str, Any]]:
    """
    Robust question extraction supporting ALL common question paper formats:

    Format A  (with punctuation):   Q1. text [10 marks]
    Format B  (no punctuation):     Q1 text (10 marks)
    Format C  (plain number):       1. text [10 marks]
    Format D  (Question prefix):    Question 1: text
    Format E  (no marks on line):   Q1 text\n...(10 marks)

    Marks are extracted from:
      - [10 marks] or (10 marks) inline on the question line
      - (10) or [10] standalone marks indicators
      - Rubric-style "(10 marks)" on a continuation line
    """
    # Patterns for marks anywhere in text
    marks_pattern = r'\[(\d+\.?\d*)\s*marks?\]|\((\d+\.?\d*)\s*marks?\)'

    # ── Pre-process: insert newlines before every question start ─────────────
    # Handles both "Q1." and "Q1 " (with space, no punctuation)
    # Avoids splitting "Q1/Q2" or decimal numbers like "3.5"
    processed = re.sub(
        r'(?<![\w/])(?=(?:Q(?:uestion)?\s*)?\d{1,2}\s*(?:[\.\.\)\:]|(?=\s+[A-Z])))',
        '\n',
        text
    )

    questions = []
    current_q = None

    # Question start: optional Q/Question prefix, then 1-2 digits,
    # then optional punctuation (. ) :) OR just a space followed by text
    Q_START = re.compile(
        r'^(?:Q(?:uestion)?\s*)?(\d{1,2})\s*(?:[\.\.\)\:]\s*|(?=\s))',
        re.IGNORECASE
    )

    # Lines to skip — metadata, headers, instructions
    SKIP_RE = re.compile(
        r'^(suggested word limit|word limit|instructions?:|answer all|marks are|page\s*\d+|evalmate)',
        re.IGNORECASE
    )

    for line in processed.split('\n'):
        line = line.strip()
        if not line or SKIP_RE.match(line):
            continue

        m = Q_START.match(line)
        if m:
            # Save previous question
            if current_q and current_q["text"].strip():
                # Strip trailing metadata from question text
                current_q["text"] = re.sub(
                    r'\s*(suggested word limit.*|word limit.*)$', '',
                    current_q["text"], flags=re.IGNORECASE
                ).strip()
                questions.append(current_q)

            q_num   = int(m.group(1))
            q_text  = line[m.end():].strip()

            # Extract marks from this line
            marks = 10.0   # sensible default for exam questions
            marks_match = re.search(marks_pattern, q_text, re.IGNORECASE)
            if marks_match:
                marks = float(marks_match.group(1) or marks_match.group(2))
                q_text = re.sub(marks_pattern, '', q_text).strip()

            current_q = {"number": q_num, "text": q_text, "marks": marks}

        elif current_q is not None:
            # Continuation line for current question
            marks_match = re.search(marks_pattern, line, re.IGNORECASE)
            if marks_match:
                current_q["marks"] = float(marks_match.group(1) or marks_match.group(2))
                line = re.sub(marks_pattern, '', line).strip()
            if line and not SKIP_RE.match(line):
                current_q["text"] += " " + line

    # Save last question
    if current_q and current_q["text"].strip():
        current_q["text"] = re.sub(
            r'\s*(suggested word limit.*|word limit.*)$', '',
            current_q["text"], flags=re.IGNORECASE
        ).strip()
        questions.append(current_q)

    return questions

# ==================== AUTHENTICATION ENDPOINTS ====================

@api_router.post("/auth/signup", response_model=TokenResponse)
async def signup(faculty: FacultySignup):
    existing = await db.faculty.find_one({"email": faculty.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    faculty_id = str(uuid.uuid4())
    faculty_data = {
        "id": faculty_id,
        "email": faculty.email,
        "password_hash": hash_password(faculty.password),
        "name": faculty.name,
        "faculty_id": faculty.faculty_id,
        "department": faculty.department,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.faculty.insert_one(faculty_data)
    token = create_access_token({"faculty_id": faculty_id, "email": faculty.email})
    
    return TokenResponse(
        access_token=token,
        faculty={
            "id": faculty_id,
            "email": faculty.email,
            "name": faculty.name,
            "faculty_id": faculty.faculty_id,
            "department": faculty.department
        }
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: FacultyLogin):
    faculty = await db.faculty.find_one({"email": credentials.email})
    if not faculty or not verify_password(credentials.password, faculty["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_access_token({"faculty_id": faculty["id"], "email": faculty["email"]})
    
    return TokenResponse(
        access_token=token,
        faculty={
            "id": faculty["id"],
            "email": faculty["email"],
            "name": faculty["name"],
            "faculty_id": faculty["faculty_id"],
            "department": faculty["department"]
        }
    )

@api_router.get("/auth/me")
async def get_me(current_faculty: dict = Depends(get_current_faculty)):
    return current_faculty

# ==================== ASSIGNMENT ENDPOINTS ====================

@api_router.post("/assignments")
async def create_assignment(
    assignment: AssignmentCreate,
    current_faculty: dict = Depends(get_current_faculty)
):
    assignment_id = str(uuid.uuid4())
    assignment_data = {
        "id": assignment_id,
        **assignment.model_dump(),
        "faculty_id": current_faculty["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.assignments.insert_one(assignment_data)
    return clean_mongo_doc(assignment_data)

@api_router.get("/assignments")
async def get_assignments(current_faculty: dict = Depends(get_current_faculty)):
    assignments = await db.assignments.find(
        {"faculty_id": current_faculty["id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    return assignments

@api_router.get("/assignments/{assignment_id}")
async def get_assignment(
    assignment_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]},
        {"_id": 0}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment

@api_router.put("/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    assignment_update: AssignmentUpdate,
    current_faculty: dict = Depends(get_current_faculty)
):
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    update_data = {k: v for k, v in assignment_update.model_dump().items() if v is not None}
    if update_data:
        await db.assignments.update_one(
            {"id": assignment_id},
            {"$set": update_data}
        )
    
    updated = await db.assignments.find_one({"id": assignment_id}, {"_id": 0})
    return updated

@api_router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    await db.assignments.delete_one({"id": assignment_id})
    await db.questions.delete_many({"assignment_id": assignment_id})
    await db.rubrics.delete_many({"assignment_id": assignment_id})
    await db.student_answers.delete_many({"assignment_id": assignment_id})
    await db.evaluations.delete_many({"assignment_id": assignment_id})
    
    return {"message": "Assignment deleted successfully"}

# ==================== QUESTION ENDPOINTS ====================

@api_router.post("/questions")
async def create_question(
    question_text: str = Form(...),
    assignment_id: str = Form(...),
    question_number: int = Form(...),
    marks: float = Form(...),
    word_limit: Optional[int] = Form(None),
    current_faculty: dict = Depends(get_current_faculty)
):
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    question_id = str(uuid.uuid4())
    question_data = {
        "id": question_id,
        "assignment_id": assignment_id,
        "question_number": question_number,
        "question_text": question_text,
        "marks": marks,
        "word_limit": word_limit,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.questions.insert_one(question_data)
    return clean_mongo_doc(question_data)

@api_router.put("/questions/{question_id}")
async def update_question(
    question_id: str,
    question_text: str = Form(None),
    marks: float = Form(None),
    word_limit: Optional[int] = Form(None),
    current_faculty: dict = Depends(get_current_faculty)
):
    question = await db.questions.find_one({"id": question_id})
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    assignment = await db.assignments.find_one(
        {"id": question["assignment_id"], "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    update_data = {}
    if question_text is not None:
        update_data["question_text"] = question_text
    if marks is not None:
        update_data["marks"] = marks
    if word_limit is not None:
        # Allow clearing word_limit by sending 0
        update_data["word_limit"] = word_limit if word_limit > 0 else None
    
    if update_data:
        await db.questions.update_one(
            {"id": question_id},
            {"$set": update_data}
        )
    
    updated = await db.questions.find_one({"id": question_id}, {"_id": 0})
    return updated

@api_router.post("/questions/upload-pdf")
async def upload_question_paper(
    file: UploadFile = File(...),
    assignment_id: str = Form(...),
    current_faculty: dict = Depends(get_current_faculty)
):
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    try:
        contents = await file.read()
        
        if file.content_type == "application/pdf":
            extracted_text = ""
            try:
                import pdfplumber, io
                with pdfplumber.open(io.BytesIO(contents)) as pdf:
                    pages_text = []
                    for page in pdf.pages:
                        t = page.extract_text()
                        if t:
                            pages_text.append(t)
                    extracted_text = "\n".join(pages_text)
            except Exception as pdf_err:
                logger.warning(f"pdfplumber failed ({pdf_err}), falling back to OCR")

            if not extracted_text.strip():
                logger.info("No text from pdfplumber, running OCR on PDF pages")
                images = convert_from_bytes(contents)
                all_text = ""
                for img in images:
                    img_array = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
                    gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
                    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                    results = ocr_reader.readtext(thresh, detail=0, paragraph=True)
                    all_text += " ".join(results) + "\n\n"
                extracted_text = all_text
        else:
            extracted_text = extract_text_from_image(contents)
        
        detected_questions = extract_questions_from_text(extracted_text)
        
        created_questions = []
        for q in detected_questions:
            question_id = str(uuid.uuid4())
            question_data = {
                "id": question_id,
                "assignment_id": assignment_id,
                "question_number": q["number"],
                "question_text": q["text"],
                "marks": q["marks"],
                "word_limit": None,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.questions.insert_one(question_data)
            created_questions.append(clean_mongo_doc(question_data))
        
        return {
            "message": f"Successfully extracted and created {len(created_questions)} questions",
            "extracted_text": extracted_text,
            "questions": created_questions
        }
    
    except Exception as e:
        logger.error(f"Error processing PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@api_router.get("/assignments/{assignment_id}/questions")
async def get_questions(
    assignment_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    questions = await db.questions.find(
        {"assignment_id": assignment_id},
        {"_id": 0}
    ).sort("question_number", 1).to_list(1000)
    return questions

@api_router.delete("/questions/{question_id}")
async def delete_question(
    question_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    question = await db.questions.find_one({"id": question_id})
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    assignment = await db.assignments.find_one(
        {"id": question["assignment_id"], "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    await db.questions.delete_one({"id": question_id})
    await db.rubrics.delete_many({"question_id": question_id})
    
    return {"message": "Question deleted successfully"}

# ==================== RUBRIC ENDPOINTS ====================

@api_router.post("/rubrics")
async def create_rubric(
    rubric: RubricCreate,
    current_faculty: dict = Depends(get_current_faculty)
):
    question = await db.questions.find_one({"id": rubric.question_id})
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    assignment = await db.assignments.find_one(
        {"id": question["assignment_id"], "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    await db.rubrics.delete_many({"question_id": rubric.question_id})
    
    rubric_id = str(uuid.uuid4())
    rubric_data = {
        "id": rubric_id,
        "question_id": rubric.question_id,
        "assignment_id": question["assignment_id"],
        "concepts": [c.model_dump() for c in rubric.concepts],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.rubrics.insert_one(rubric_data)
    return clean_mongo_doc(rubric_data)

@api_router.put("/rubrics/{rubric_id}")
async def update_rubric(
    rubric_id: str,
    rubric_update: RubricCreate,
    current_faculty: dict = Depends(get_current_faculty)
):
    rubric = await db.rubrics.find_one({"id": rubric_id})
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")
    
    question = await db.questions.find_one({"id": rubric["question_id"]})
    assignment = await db.assignments.find_one(
        {"id": question["assignment_id"], "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    await db.rubrics.update_one(
        {"id": rubric_id},
        {"$set": {"concepts": [c.model_dump() for c in rubric_update.concepts]}}
    )
    
    updated = await db.rubrics.find_one({"id": rubric_id}, {"_id": 0})
    return updated

@api_router.get("/rubrics/{rubric_id}")
async def get_rubric(
    rubric_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    rubric = await db.rubrics.find_one({"id": rubric_id}, {"_id": 0})
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")
    return rubric

@api_router.get("/rubrics/assignment/{assignment_id}")
async def get_assignment_rubrics(
    assignment_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    rubrics = await db.rubrics.find(
        {"assignment_id": assignment_id},
        {"_id": 0}
    ).to_list(1000)
    return rubrics


# ═══════════════════════════════════════════════════════════
# RUBRIC PDF UPLOAD — parse PDF and auto-fill rubrics
# ═══════════════════════════════════════════════════════════

def _parse_rubric_pdf_from_file(pdf_bytes: bytes) -> list:
    """
    Format-agnostic rubric PDF parser. Automatically detects and handles:

    FORMAT A — EvalMate two-column table (pdfplumber word positions):
      Concept Description     Marks
      Definition: text...     2.0
      Real-world example...   1.5

    FORMAT B — Bullet/dash list with inline marks in parentheses:
      Q1 Rubric (10 marks)
      - Concept description (4)
      - Another concept (2)

    FORMAT C — Numbered list with inline marks:
      Q1 (10 marks)
      1. Concept description - 4 marks
      2. Another concept - 2 marks

    FORMAT D — Table without fixed column (marks at end after tab/spaces):
      Q1. Question text [10 marks]
      Concept description    4
      Another concept        2

    Tries each format in order. Returns whichever gives the most concepts.
    """
    import pdfplumber as _pdfplumber
    import io as _io

    # ── Extract full text for format detection ────────────────────────────────
    full_text = ""
    word_data = []    # [(page_idx, top, x0, text)] for columnar parsing
    try:
        with _pdfplumber.open(_io.BytesIO(pdf_bytes)) as pdf:
            for page_idx, page in enumerate(pdf.pages):
                t = page.extract_text()
                if t:
                    full_text += t + "\n"
                for w in page.extract_words():
                    word_data.append((page_idx, round(w["top"]), w["x0"], w["text"]))
    except Exception as e:
        logger.error(f"pdfplumber failed: {e}")
        return []

    if not full_text.strip():
        return []

    # Try all parsers and return the best result
    results_a = _parse_rubric_columnar(word_data)
    results_b = _parse_rubric_bullet_list(full_text)
    results_c = _parse_rubric_inline_marks(full_text)

    # Score each: total concepts extracted
    def score(r): return sum(len(q["concepts"]) for q in r)

    best = max([results_a, results_b, results_c], key=score)
    logger.info(
        f"Rubric parse results — columnar:{score(results_a)} "
        f"bullet:{score(results_b)} inline:{score(results_c)} "
        f"→ using {'columnar' if best is results_a else 'bullet' if best is results_b else 'inline'}"
    )
    return best


def _parse_rubric_columnar(word_data: list) -> list:
    """EvalMate two-column table format using word x-positions."""
    MARKS_X    = 370
    MARKS_RE   = re.compile(r'^\d+(?:\.\d+)?$')
    Q_HDR_RE   = re.compile(r'^Q(\d{1,2})\.', re.IGNORECASE)
    SKIP_RE    = re.compile(r'^(EvalMate.*|Page\s+\d+|Concept\s+Description|Marks?)\s*$', re.IGNORECASE)

    all_rows = []
    page_rows_map = {}
    for (page_idx, top, x0, text) in word_data:
        key = (page_idx, top)
        if key not in page_rows_map:
            page_rows_map[key] = {"desc": [], "marks": []}
        if x0 > MARKS_X:
            page_rows_map[key]["marks"].append(text)
        else:
            page_rows_map[key]["desc"].append(text)

    for (page_idx, top) in sorted(page_rows_map.keys()):
        r  = page_rows_map[(page_idx, top)]
        dt = " ".join(r["desc"]).strip()
        mt = re.sub(r'.*\[\d+.*\].*', '', " ".join(r["marks"])).strip()
        mv = None
        if MARKS_RE.match(mt):
            v = float(mt)
            if 0 < v <= 20:
                mv = v
        all_rows.append((page_idx * 100000 + top, dt, mv))

    results = []
    cur_q   = None
    pending = []

    def _is_cont(frag):
        return bool(frag) and (frag[0].islower() or frag[0] == "(")

    def _save(parts, mv):
        if not parts or mv is None or cur_q is None:
            return
        clean = [f for i, f in enumerate(parts) if not (i == 0 and _is_cont(f))]
        if not clean:
            return
        desc = " ".join(clean).strip().rstrip(".,;")
        desc = re.sub(r'\s+', " ", desc).strip().rstrip(".,;")
        if len(desc) > 5:
            cur_q["concepts"].append({"description": desc, "marks": mv})

    for (_, dt, mv) in all_rows:
        if not dt and mv is None:
            continue
        if dt and SKIP_RE.match(dt):
            continue
        if dt and Q_HDR_RE.match(dt):
            pending = []
            cur_q = {"question_number": int(Q_HDR_RE.match(dt).group(1)), "concepts": []}
            results.append(cur_q)
            continue
        if cur_q is None:
            continue

        if not dt and mv is not None:
            _save(pending, mv)
            pending = []
        elif dt and mv is not None:
            pending.append(dt)
            _save(pending, mv)
            pending = []
        elif dt:
            if _is_cont(dt) and cur_q["concepts"] and not pending:
                last = cur_q["concepts"][-1]
                extra = dt.strip().rstrip(".,;")
                last["description"] = re.sub(r'\s+', " ",
                    last["description"] + " " + extra).strip().rstrip(".,;")
            else:
                pending.append(dt)

    return results


def _parse_rubric_bullet_list(text: str) -> list:
    """
    Bullet/dash list format:
      Q1 Rubric (10 marks)
      - Concept description (4)
      - Another concept (2)

    Also handles:
      * concept (3)
      • concept (2)
      concept text (marks)  ← no bullet, just line ending with (N)
    """
    Q_HDR_RE    = re.compile(r'(?:^|\n)\s*Q(\d{1,2})(?:\s|\.|\))', re.IGNORECASE)
    SKIP_RE     = re.compile(r'^(EvalMate.*|Page\s+\d+|Concept\s+Description|Marks?|Instructions?|Rubric)\s*$', re.IGNORECASE)
    # Match: optional bullet, concept text, marks in parens at end
    # Marks must be a standalone number (not part of a longer expression)
    CONCEPT_RE  = re.compile(r'^(?:[-•*\u2022]\s*)?(.+?)\s+\((\d+(?:\.\d+)?)\)\s*$')

    results  = []
    cur_q    = None
    lines    = text.split("\n")

    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue

        # Check for question header
        m = re.match(r'^Q(\d{1,2})(?:\s+\w|\s*$|[\.\.\)\:])', line, re.IGNORECASE)
        if m:
            cur_q = {"question_number": int(m.group(1)), "concepts": []}
            results.append(cur_q)
            continue

        if cur_q is None or SKIP_RE.match(line):
            continue

        cm = CONCEPT_RE.match(line)
        if cm:
            desc  = cm.group(1).strip().rstrip(".,;:-")
            marks = float(cm.group(2))
            if 0 < marks <= 20 and len(desc) > 3:
                cur_q["concepts"].append({"description": desc, "marks": marks})

    return results


def _parse_rubric_inline_marks(text: str) -> list:
    """
    Inline marks format — marks appear as trailing number after dash/colon/space:
      1. Concept description - 4 marks
      Concept description: 3 marks
      Concept description ... 2

    Also handles table-style where marks are separated by whitespace at end of line.
    """
    Q_HDR_RE   = re.compile(r'^Q(\d{1,2})(?:\s|\.|\))', re.IGNORECASE)
    SKIP_RE    = re.compile(r'^(EvalMate.*|Page\s+\d+|Concept\s+Description|Marks?|Instructions?)\s*$', re.IGNORECASE)
    # "text - 4 marks" or "text: 3 marks" or "text   4" (trailing number)
    INLINE_RE  = re.compile(r'^(.+?)\s+[-–:]?\s*(\d+(?:\.\d+)?)\s*(?:marks?)?\s*$')

    results = []
    cur_q   = None

    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue

        m = re.match(r'^Q(\d{1,2})(?:\s|\.|\))', line, re.IGNORECASE)
        if m:
            cur_q = {"question_number": int(m.group(1)), "concepts": []}
            results.append(cur_q)
            continue

        if cur_q is None or SKIP_RE.match(line):
            continue

        # Skip bullet starters — those are handled by bullet parser
        if line.startswith("-") or line.startswith("•") or line.startswith("*"):
            # Still try to parse them here as fallback
            line = re.sub(r'^[-•*]\s*', '', line)

        im = INLINE_RE.match(line)
        if im:
            desc  = im.group(1).strip().rstrip(".,;:-")
            marks = float(im.group(2))
            # Sanity: marks must be reasonable and description must be meaningful
            if 0 < marks <= 20 and len(desc) > 5:
                # Avoid treating question headers like "Q1 Rubric" as concepts
                if not re.match(r'Q\d', desc, re.IGNORECASE):
                    cur_q["concepts"].append({"description": desc, "marks": marks})

    return results


def _parse_rubric_text_universal(text: str) -> list:
    """
    Universal rubric parser for plain-text extracted PDFs.
    Handles any of these concept formats:
      - concept text (marks)          ← bullet list with round brackets
      * concept text (marks)          ← asterisk bullets
      concept text - marks            ← dash separator
      concept text: marks             ← colon separator
      concept text    marks           ← trailing number (tabular)
    Question headers: Q1 / Q1. / Q1: / Q1 Rubric (10 marks)
    """
    results  = []
    cur_q    = None

    # Question header: Q1 / Q1. / Q1 Rubric / Q1: etc
    Q_HDR = re.compile(
        r'(?:^|\n)\s*Q(\d{1,2})\s*(?:Rubric)?\s*[.):\-]?\s*(?:[\(\[]\d+.*?[\)\]])?\s*$',
        re.IGNORECASE | re.MULTILINE
    )

    # Concept line patterns (in priority order)
    BULLET_RE   = re.compile(r'^\s*[-*•]\s+(.+?)\s*\((\d+\.?\d*)\)\s*$')   # - text (N)
    TRAILING_RE = re.compile(r'^\s*[-*•]?\s*(.+?)\s+(\d+\.?\d*)\s*$')         # text N
    SKIP_RE     = re.compile(
        r'^(EvalMate|Page\s*\d+|Q\d|Rubric|marks?|concept|instructions?)\b',
        re.IGNORECASE
    )

    # Split into question blocks
    positions = [(m.start(), int(m.group(1))) for m in Q_HDR.finditer('\n' + text)]

    if not positions:
        return []

    full = '\n' + text
    for idx, (pos, q_num) in enumerate(positions):
        end   = positions[idx+1][0] if idx+1 < len(positions) else len(full)
        block = full[pos:end]

        # Skip the header line itself
        block_lines = block.split('\n')[2:]

        concepts = []
        for line in block_lines:
            line = line.strip()
            if not line or SKIP_RE.match(line):
                continue

            # Try bullet with parens: "- concept text (4)"
            m = BULLET_RE.match(line)
            if m:
                desc  = m.group(1).strip().rstrip(',;-')
                marks = float(m.group(2))
                if 0 < marks <= 20 and len(desc) > 3:
                    concepts.append({"description": desc, "marks": marks})
                continue

            # Try trailing number: "concept text 4" or "- concept 2"
            m = TRAILING_RE.match(line)
            if m:
                desc  = m.group(1).strip().lstrip('- *•').rstrip(',;-').strip()
                marks = float(m.group(2))
                if 0 < marks <= 20 and len(desc) > 3:
                    concepts.append({"description": desc, "marks": marks})

        if concepts:
            results.append({"question_number": q_num, "concepts": concepts})

    return results

@api_router.post("/rubrics/upload-pdf/{assignment_id}")
async def upload_rubric_pdf(
    assignment_id: str,
    file: UploadFile = File(...),
    current_faculty: dict = Depends(get_current_faculty)
):
    """Parse a rubric PDF and auto-save rubrics for each question in the assignment."""
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    contents = await file.read()
    # ── Try columnar parser first (EvalMate two-column PDF) ────────────────
    parsed = _parse_rubric_pdf_from_file(contents)

    # ── If columnar parser found nothing, try universal text-based parser ──
    if not parsed:
        logger.info("Columnar rubric parser found nothing — trying universal text parser")
        extracted_text = ""
        try:
            import pdfplumber as _pl2, io as _io3
            with _pl2.open(_io3.BytesIO(contents)) as _pdf2:
                pages = [p.extract_text() for p in _pdf2.pages if p.extract_text()]
                extracted_text = "\n".join(pages)
        except Exception as _e:
            logger.warning(f"pdfplumber text extraction failed: {_e}")

        if not extracted_text.strip():
            raise HTTPException(status_code=422, detail="Could not extract text from PDF.")

        parsed = _parse_rubric_text_universal(extracted_text)

    if not parsed:
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not parse rubrics from this PDF. "
                "Supported formats:\n"
                "1. EvalMate two-column: concept text on left, marks number on right\n"
                "2. Bullet format: - concept text (marks)\n"
                "3. Any format where each concept line ends with a number"
            )
        )

    questions = await db.questions.find(
        {"assignment_id": assignment_id}, {"_id": 0}
    ).sort("question_number", 1).to_list(1000)
    q_by_num = {q["question_number"]: q for q in questions}

    saved, skipped = [], []
    for entry in parsed:
        q_num    = entry["question_number"]
        concepts = entry["concepts"]
        if q_num not in q_by_num:
            skipped.append({"question_number": q_num, "reason": "No matching question in assignment"})
            continue
        if not concepts:
            skipped.append({"question_number": q_num, "reason": "No concepts parsed"})
            continue
        question_id = q_by_num[q_num]["id"]
        await db.rubrics.delete_many({"question_id": question_id})
        rubric_id = str(uuid.uuid4())
        await db.rubrics.insert_one({
            "id": rubric_id, "question_id": question_id,
            "assignment_id": assignment_id, "concepts": concepts,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        saved.append({"question_number": q_num, "rubric_id": rubric_id,
                      "concepts_count": len(concepts), "concepts": concepts})

    return {
        "message": f"Saved rubrics for {len(saved)} question(s). {len(skipped)} skipped.",
        "saved": saved,
        "skipped": skipped
    }


def split_answers_by_question(text: str, question_numbers: list) -> dict:
    if not text or not question_numbers:
        return {n: "" for n in question_numbers}

    nums = sorted(set(int(n) for n in question_numbers))
    num_pattern = '|'.join(str(n) for n in nums)

    split_re = re.compile(rf'(?:^|\n)\s*(?:(?:Ans(?:wer)?|Q|Question)\s*)?({num_pattern})\s*[.)\]:-]\s*', re.IGNORECASE)

    segments = {}
    matches = list(split_re.finditer(text))

    if matches:
        for i, m in enumerate(matches):
            q_num = int(m.group(1))
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            seg = text[start:end].strip()
            if seg:
                segments[q_num] = seg

    if segments:
        return {n: segments.get(n, "").strip() for n in nums}

    logger.info("No question markers found — splitting by paragraphs")
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n+', text) if p.strip()]
    result = {}
    for i, n in enumerate(nums):
        result[n] = paragraphs[i] if i < len(paragraphs) else ""
    return result


async def process_answer_script_and_update(
    contents: bytes,
    file_type: str,
    assignment_id: str,
    student_name: str,
    roll_number: str,
    pending_id: str
):
    """Background task: text extraction → store answers → evaluate automatically"""
    try:
        # ---- Step 1: Text Extraction ----
        if file_type == "application/pdf":
            extracted_text = ""
            try:
                import pdfplumber, io as _io
                with pdfplumber.open(_io.BytesIO(contents)) as pdf:
                    pages_text = []
                    for page in pdf.pages:
                        t = page.extract_text()
                        if t and t.strip():
                            pages_text.append(t.strip())
                    extracted_text = "\n".join(pages_text)
                if extracted_text.strip():
                    logger.info(f"pdfplumber extracted {len(extracted_text)} chars for {student_name}")
                else:
                    logger.info(f"pdfplumber found no text for {student_name}, trying OCR")
            except Exception as pdf_err:
                logger.warning(f"pdfplumber failed for {student_name}: {pdf_err}")

            if not extracted_text.strip():
                logger.info(f"Running OCR on PDF for {student_name}")
                images = convert_from_bytes(contents)
                all_text = ""
                for img in images:
                    img_array = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
                    gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
                    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                    results = ocr_reader.readtext(thresh, detail=0, paragraph=True)
                    all_text += " ".join(results) + "\n\n"
                extracted_text = all_text
        else:
            extracted_text = extract_text_from_image(contents)

        # ---- Step 2: Fetch questions ----
        questions = await db.questions.find(
            {"assignment_id": assignment_id}, {"_id": 0}
        ).sort("question_number", 1).to_list(1000)

        question_numbers = [q.get("question_number", i + 1) for i, q in enumerate(questions)]
        answer_map = split_answers_by_question(extracted_text, question_numbers)

        # ---- Step 3: Store answers ----
        answer_ids = []
        for i, q in enumerate(questions):
            q_num = q.get("question_number", i + 1)
            per_q_text = answer_map.get(q_num, extracted_text)

            answer_id = str(uuid.uuid4())
            answer_data = {
                "id": answer_id,
                "assignment_id": assignment_id,
                "student_name": student_name,
                "roll_number": roll_number,
                "question_id": q["id"],
                "answer_text": per_q_text,
                "extracted_at": datetime.now(timezone.utc).isoformat()
            }
            await db.student_answers.insert_one(answer_data)
            answer_ids.append((answer_id, q["id"], per_q_text))

        # ---- Step 4: Mark pending record as processed ----
        await db.uploaded_scripts.update_one(
            {"id": pending_id},
            {"$set": {
                "status": "processed",
                "answer_text": extracted_text[:500],
                "extracted_at": datetime.now(timezone.utc).isoformat()
            }}
        )

        # ---- Step 5: Evaluate each answer ----
        for (answer_id, question_id, q_answer_text) in answer_ids:
            try:
                rubric = await db.rubrics.find_one({"question_id": question_id}, {"_id": 0})
                if not rubric or not rubric.get("concepts"):
                    continue

                if not q_answer_text or len(q_answer_text.strip()) < 5:
                    max_marks = sum(c["marks"] for c in rubric["concepts"])
                    zero_scores = [{
                        "concept": c["description"], "max_marks": c["marks"],
                        "awarded_marks": 0.0, "similarity_score": 0.0
                    } for c in rubric["concepts"]]
                    await db.evaluations.insert_one({
                        "id": str(uuid.uuid4()), "student_answer_id": answer_id,
                        "question_id": question_id, "assignment_id": assignment_id,
                        "student_name": student_name, "roll_number": roll_number,
                        "concept_scores": zero_scores, "total_marks": 0.0,
                        "max_marks": max_marks, "confidence_score": 0.0,
                        "needs_review": True, "reviewed": False,
                        "final_marks": None, "faculty_comments": "Student did not answer this question.",
                        "evaluated_at": datetime.now(timezone.utc).isoformat()
                    })
                    continue

                concept_scores = []
                total_marks_sem = 0    # semantic-only total
                total_marks_llm = 0    # full-LLM total
                max_marks = 0

                for concept in rubric["concepts"]:
                    # ── Semantic score (local, fast — always computed on upload) ──
                    sem_sim   = compute_semantic_similarity(q_answer_text, concept["description"])
                    sem_pct   = _similarity_to_marks_pct(sem_sim)
                    sem_marks = min(standardise_marks(sem_pct * concept["marks"]), concept["marks"])

                    # ── Combined score (semantic + LLM for examples only) ──────
                    # This is the default "Semantic+LLM" mode shown in Results.
                    # For example concepts: max(semantic, LLM). For others: semantic only.
                    combined_sim   = await compute_similarity_async(q_answer_text, concept["description"])
                    combined_marks = min(standardise_marks(_similarity_to_marks_pct(combined_sim) * concept["marks"]), concept["marks"])

                    concept_scores.append({
                        "concept":              concept["description"],
                        "max_marks":            concept["marks"],
                        # Semantic + LLM for examples (default mode)
                        "awarded_marks":        combined_marks,
                        "similarity_score":     round(combined_sim, 3),
                        # Pure semantic only
                        "awarded_marks_sem":    sem_marks,
                        "similarity_score_sem": round(sem_sim, 3),
                        # Full LLM — computed on-demand when faculty requests LLM mode
                        # Stored as None until compute_llm_assessment() is called
                        "awarded_marks_llm":    None,
                        "similarity_score_llm": None,
                    })
                    total_marks_sem += sem_marks
                    # LLM total is None until on-demand computation
                    max_marks       += concept["marks"]

                total_marks_std     = min(standardise_marks(sum(cs["awarded_marks"] for cs in concept_scores)), max_marks)
                total_marks_sem_std = min(standardise_marks(total_marks_sem), max_marks)
                total_marks_llm_std = None   # computed on-demand via /evaluations/compute-llm
                confidence_score    = (sum(cs["awarded_marks"] for cs in concept_scores)) / max_marks if max_marks > 0 else 0
                needs_review        = confidence_score < 0.75

                # ── Word Limit Penalty ──────────────────────────────────────
                # Fetch the question's word_limit and apply graduated reduction
                question_doc = await db.questions.find_one({"id": question_id}, {"_id": 0})
                q_word_limit = question_doc.get("word_limit") if question_doc else None
                answer_word_count = len(q_answer_text.split()) if q_answer_text else 0
                word_limit_penalty_applied = False

                if q_word_limit and q_word_limit > 0 and answer_word_count < q_word_limit:
                    ratio = answer_word_count / q_word_limit
                    if ratio < 0.90:
                        # Apply penalty to all three mark totals
                        total_marks_std     = _apply_word_limit_penalty(total_marks_std, max_marks, answer_word_count, q_word_limit)
                        total_marks_sem_std = _apply_word_limit_penalty(total_marks_sem_std, max_marks, answer_word_count, q_word_limit)
                        word_limit_penalty_applied = True
                        logger.info(f"Word limit penalty: {answer_word_count}/{q_word_limit} words, ratio={ratio:.2f}")

                evaluation_data = {
                    "id": str(uuid.uuid4()),
                    "student_answer_id": answer_id,
                    "question_id": question_id,
                    "assignment_id": assignment_id,
                    "student_name": student_name,
                    "roll_number": roll_number,
                    "concept_scores": concept_scores,
                    "total_marks":     total_marks_std,        # combined (default view)
                    "total_marks_sem": total_marks_sem_std,    # semantic-only view
                    "total_marks_llm": total_marks_llm_std,    # full-LLM view
                    "max_marks": max_marks,
                    "confidence_score": round(confidence_score, 3),
                    "needs_review": needs_review,
                    "reviewed": False,
                    "final_marks": None,
                    "faculty_comments": None,
                    "word_count": answer_word_count,
                    "word_limit": q_word_limit,
                    "word_limit_penalty_applied": word_limit_penalty_applied,
                    "evaluated_at": datetime.now(timezone.utc).isoformat()
                }
                await db.evaluations.insert_one(evaluation_data)

            except Exception as e:
                logger.error(f"Error evaluating answer {answer_id}: {e}")

        logger.info(f"✅ Processed & evaluated: {student_name} ({roll_number})")

    except Exception as e:
        await db.uploaded_scripts.update_one(
            {"id": pending_id},
            {"$set": {"status": "error", "error": str(e)}}
        )
        logger.error(f"❌ Background processing failed for {student_name}: {e}")


# ==================== ANSWER SCRIPT ENDPOINTS ====================

@api_router.post("/answer-scripts/upload")
async def upload_answer_script(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    assignment_id: str = Form(...),
    student_name: str = Form(...),
    roll_number: str = Form(...),
    current_faculty: dict = Depends(get_current_faculty)
):
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    contents = await file.read()
    file_type = file.content_type

    pending_id = str(uuid.uuid4())
    pending_record = {
        "id": pending_id,
        "assignment_id": assignment_id,
        "student_name": student_name,
        "roll_number": roll_number,
        "question_id": None,
        "answer_text": None,
        "status": "pending",
        "extracted_at": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.uploaded_scripts.insert_one(pending_record)

    background_tasks.add_task(
        process_answer_script_and_update,
        contents,
        file_type,
        assignment_id,
        student_name,
        roll_number,
        pending_id
    )

    return {
        "message": "Upload successful. OCR and evaluation processing in background.",
        "student_name": student_name,
        "roll_number": roll_number,
        "upload_id": pending_id
    }


# ═══════════════════════════════════════════════════════════
# FIX 1 ── BULK / FOLDER UPLOAD ENDPOINT
# ═══════════════════════════════════════════════════════════

@api_router.post("/answer-scripts/bulk-upload")
async def bulk_upload_answer_scripts(
    background_tasks: BackgroundTasks,
    assignment_id: str = Form(...),
    files: List[UploadFile] = File(...),
    skip_existing: bool = Form(True),   # True = skip if SAP ID already exists
    current_faculty: dict = Depends(get_current_faculty)
):
    """
    Bulk upload multiple answer scripts at once.

    Frontend usage (two options):
      Option A — multiple file inputs:
        <input type="file" multiple accept=".pdf,.jpg,.png">
        → upload all as  files[]  in a multipart form

      Option B — upload a ZIP containing all scripts:
        <input type="file" accept=".zip">
        → single file named  files[]  containing the zip

    Each filename MUST follow the format:  SAPID_StudentName.pdf
    Example:  500120443_AryanRaj.pdf

    The SAP ID is used as the unique roll_number.
    If skip_existing=True (default): a SAP ID already in the DB for this
    assignment will be skipped (not re-uploaded).
    If skip_existing=False: existing record will be replaced.
    """
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # ── Collect (filename, bytes, content_type) tuples to process ────────────
    file_entries: list[tuple[str, bytes, str]] = []

    for uploaded in files:
        raw = await uploaded.read()

        # If the single file is a ZIP, extract its contents
        if uploaded.filename.lower().endswith(".zip") or uploaded.content_type in (
            "application/zip", "application/x-zip-compressed"
        ):
            try:
                zf = zipfile.ZipFile(io.BytesIO(raw))
                for entry in zf.infolist():
                    if entry.is_dir():
                        continue
                    name = Path(entry.filename).name  # strip folder paths inside zip
                    ext = Path(name).suffix.lower()
                    if ext not in ('.pdf', '.jpg', '.jpeg', '.png'):
                        continue
                    ctype = "application/pdf" if ext == ".pdf" else f"image/{ext.lstrip('.')}"
                    file_entries.append((name, zf.read(entry.filename), ctype))
            except Exception as ze:
                raise HTTPException(status_code=400, detail=f"Could not read ZIP file: {ze}")
        else:
            # Regular file
            ext = Path(uploaded.filename).suffix.lower()
            if ext not in ('.pdf', '.jpg', '.jpeg', '.png'):
                continue
            ctype = uploaded.content_type or (
                "application/pdf" if ext == ".pdf" else f"image/{ext.lstrip('.')}"
            )
            file_entries.append((uploaded.filename, raw, ctype))

    if not file_entries:
        raise HTTPException(
            status_code=400,
            detail="No valid files found. Use .pdf / .jpg / .png files or a ZIP containing them."
        )

    # ── Process each file ────────────────────────────────────────────────────
    results = {"queued": [], "skipped": [], "errors": []}

    for (filename, contents, file_type) in file_entries:
        sap_id, student_name = parse_sapid_filename(filename)

        if not sap_id:
            results["errors"].append({
                "file": filename,
                "reason": "Cannot parse SAP ID. Filename must be: SAPID_Name.pdf"
            })
            continue

        if not student_name:
            student_name = sap_id  # fallback

        # Check if SAP ID already exists for this assignment
        existing = await db.uploaded_scripts.find_one({
            "assignment_id": assignment_id,
            "roll_number": sap_id
        })

        if existing and skip_existing:
            results["skipped"].append({
                "file": filename,
                "sap_id": sap_id,
                "student_name": student_name,
                "reason": "Already uploaded (skip_existing=True)"
            })
            continue

        # If not skipping and exists, remove old records so re-evaluation runs fresh
        if existing and not skip_existing:
            old_id = existing["id"]
            await db.uploaded_scripts.delete_many({
                "assignment_id": assignment_id, "roll_number": sap_id
            })
            await db.student_answers.delete_many({
                "assignment_id": assignment_id, "roll_number": sap_id
            })
            await db.evaluations.delete_many({
                "assignment_id": assignment_id, "roll_number": sap_id
            })

        # Create pending record immediately
        pending_id = str(uuid.uuid4())
        pending_record = {
            "id": pending_id,
            "assignment_id": assignment_id,
            "student_name": student_name,
            "roll_number": sap_id,          # SAP ID used as unique roll number
            "sap_id": sap_id,
            "question_id": None,
            "answer_text": None,
            "status": "pending",
            "source_filename": filename,
            "extracted_at": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.uploaded_scripts.insert_one(pending_record)

        # Queue background processing
        background_tasks.add_task(
            process_answer_script_and_update,
            contents,
            file_type,
            assignment_id,
            student_name,
            sap_id,          # roll_number = SAP ID
            pending_id
        )

        results["queued"].append({
            "file": filename,
            "sap_id": sap_id,
            "student_name": student_name,
            "upload_id": pending_id
        })

    return {
        "message": (
            f"{len(results['queued'])} scripts queued for processing, "
            f"{len(results['skipped'])} skipped, "
            f"{len(results['errors'])} errors."
        ),
        "total_files": len(file_entries),
        **results
    }


@api_router.get("/student-answers/assignment/{assignment_id}")
async def get_student_answers(
    assignment_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    """Get all student answers for an assignment to show upload status"""
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    pipeline = [
        {"$match": {"assignment_id": assignment_id}},
        {
            "$group": {
                "_id": {
                    "student_name": "$student_name",
                    "roll_number": "$roll_number"
                },
                "student_name": {"$first": "$student_name"},
                "roll_number": {"$first": "$roll_number"},
                "uploaded_at": {"$first": "$extracted_at"}
            }
        }
    ]
    
    results = await db.student_answers.aggregate(pipeline).to_list(1000)
    return results

@api_router.get("/uploaded-scripts/assignment/{assignment_id}")
async def get_uploaded_students(
    assignment_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    """
    Returns list of unique students with upload + processing status.
    Includes pending (OCR in progress) and processed students.
    """
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    uploaded = await db.uploaded_scripts.find(
        {"assignment_id": assignment_id},
        {"_id": 0}
    ).to_list(1000)

    if not uploaded:
        answers = await db.student_answers.find(
            {"assignment_id": assignment_id},
            {"_id": 0}
        ).to_list(1000)
        seen = set()
        result = []
        for a in answers:
            if a["roll_number"] not in seen:
                seen.add(a["roll_number"])
                result.append({
                    "id": a["id"],
                    "student_name": a["student_name"],
                    "roll_number": a["roll_number"],
                    "status": "processed",
                    "created_at": a.get("extracted_at", ""),
                    "extracted_at": a.get("extracted_at", "")
                })
        return result

    seen = {}
    for record in uploaded:
        key = record["roll_number"]
        if key not in seen or record.get("created_at", "") > seen[key].get("created_at", ""):
            seen[key] = record

    return list(seen.values())

# ==================== EVALUATION ENDPOINTS ====================

@api_router.get("/student-answers/student/{assignment_id}/{roll_number}")
async def get_student_answers_for_review(
    assignment_id: str,
    roll_number: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    """Get all answer texts for a specific student — used in the review page."""
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    answers = await db.student_answers.find(
        {"assignment_id": assignment_id, "roll_number": roll_number},
        {"_id": 0}
    ).to_list(1000)
    return answers


# ═══════════════════════════════════════════════════════════════════════════
# ON-DEMAND FULL-LLM ASSESSMENT
# Faculty clicks "LLM Mode" in Results → frontend calls this once per assignment
# → backend calls Groq for every concept × every student and saves results
# ═══════════════════════════════════════════════════════════════════════════

@api_router.post("/evaluations/compute-llm/{assignment_id}")
async def compute_llm_assessment(
    assignment_id: str,
    background_tasks: BackgroundTasks,
    current_faculty: dict = Depends(get_current_faculty)
):
    """
    Trigger full-LLM re-evaluation for every student in this assignment.
    Calls Groq for EVERY rubric concept (not just examples).
    Results are stored as awarded_marks_llm per concept and total_marks_llm per evaluation.

    This is rate-limited (2.5s per Groq call) so for 60 students × 5 questions × 3 concepts
    = 900 calls × 2.5s = ~38 minutes. Runs entirely in background.
    Frontend polls /evaluations/llm-status/{assignment_id} to check progress.
    """
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Check if already computing
    existing = await db.llm_compute_status.find_one({"assignment_id": assignment_id})
    if existing and existing.get("status") == "running":
        return {"message": "LLM assessment already running", "status": "running",
                "progress": existing.get("progress", 0), "total": existing.get("total", 0)}

    # Count evaluations to process
    total_evals = await db.evaluations.count_documents({"assignment_id": assignment_id})

    # Create/reset status record
    await db.llm_compute_status.replace_one(
        {"assignment_id": assignment_id},
        {"assignment_id": assignment_id, "status": "running",
         "progress": 0, "total": total_evals,
         "started_at": datetime.now(timezone.utc).isoformat()},
        upsert=True
    )

    background_tasks.add_task(_run_llm_assessment_background, assignment_id, total_evals)

    return {"message": f"LLM assessment started for {total_evals} evaluations",
            "status": "running", "total": total_evals}


@api_router.get("/evaluations/llm-status/{assignment_id}")
async def get_llm_status(
    assignment_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    """Poll this to check LLM computation progress."""
    status = await db.llm_compute_status.find_one(
        {"assignment_id": assignment_id}, {"_id": 0}
    )
    if not status:
        return {"status": "not_started", "progress": 0, "total": 0}
    return status


async def _run_llm_assessment_background(assignment_id: str, total_evals: int):
    """
    Background task: evaluate every concept in every evaluation using full LLM.
    Saves awarded_marks_llm and total_marks_llm back to DB.
    """
    progress = 0
    try:
        # Load all evaluations for this assignment
        evaluations = await db.evaluations.find(
            {"assignment_id": assignment_id}, {"_id": 0}
        ).to_list(10000)

        # Load all student answers (for the answer text)
        all_answers = await db.student_answers.find(
            {"assignment_id": assignment_id}, {"_id": 0}
        ).to_list(10000)

        # Map: answer_id → answer_text
        answer_map = {a["id"]: a.get("answer_text", "") for a in all_answers}

        for ev in evaluations:
            try:
                answer_text = answer_map.get(ev.get("student_answer_id"), "")
                if not answer_text or len(answer_text.strip()) < 5:
                    progress += 1
                    continue

                updated_concepts = []
                total_llm = 0.0

                for cs in ev.get("concept_scores", []):
                    concept_desc = cs.get("concept", "")
                    max_marks    = cs.get("max_marks", 0)

                    # Call Groq for this concept
                    llm_score = None
                    if GROQ_API_KEY:
                        llm_score = await _groq_score(answer_text, concept_desc)
                    if llm_score is None and GEMINI_API_KEY:
                        llm_score = await _gemini_score(answer_text, concept_desc)

                    # Fall back to semantic if LLM unavailable
                    if llm_score is None:
                        llm_score = compute_semantic_similarity(answer_text, concept_desc)

                    llm_pct   = _similarity_to_marks_pct(llm_score)
                    # Cap at concept max BEFORE standardising to prevent rounding over
                    llm_marks = min(standardise_marks(llm_pct * max_marks), max_marks)

                    updated_cs = {**cs,
                        "awarded_marks_llm":    llm_marks,
                        "similarity_score_llm": round(llm_score, 3)
                    }
                    updated_concepts.append(updated_cs)
                    total_llm += llm_marks

                ev_max = ev.get("max_marks", 0)
                total_llm_std = min(standardise_marks(total_llm), ev_max)

                # ── Word Limit Penalty (same as semantic+LLM path) ──
                q_word_limit = ev.get("word_limit")
                answer_word_count = ev.get("word_count", len(answer_text.split()) if answer_text else 0)
                if q_word_limit and q_word_limit > 0 and answer_word_count < q_word_limit:
                    ratio = answer_word_count / q_word_limit
                    if ratio < 0.90:
                        total_llm_std = _apply_word_limit_penalty(total_llm_std, ev_max, answer_word_count, q_word_limit)
                        logger.info(f"LLM word limit penalty: {answer_word_count}/{q_word_limit} words")

                # Save back to DB
                await db.evaluations.update_one(
                    {"id": ev["id"]},
                    {"$set": {
                        "concept_scores":    updated_concepts,
                        "total_marks_llm":   total_llm_std,
                    }}
                )

                progress += 1
                if progress % 10 == 0:
                    await db.llm_compute_status.update_one(
                        {"assignment_id": assignment_id},
                        {"$set": {"progress": progress}}
                    )

            except Exception as e:
                logger.error(f"LLM assessment failed for eval {ev.get('id')}: {e}")
                progress += 1

        # Mark complete
        await db.llm_compute_status.update_one(
            {"assignment_id": assignment_id},
            {"$set": {"status": "done", "progress": progress,
                      "completed_at": datetime.now(timezone.utc).isoformat()}}
        )
        logger.info(f"✅ LLM assessment complete for {assignment_id}: {progress} evals")

    except Exception as e:
        await db.llm_compute_status.update_one(
            {"assignment_id": assignment_id},
            {"$set": {"status": "error", "error": str(e)}}
        )
        logger.error(f"LLM assessment background task failed: {e}")

@api_router.get("/evaluations/assignment/{assignment_id}")
async def get_evaluations(
    assignment_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    evaluations = await db.evaluations.find(
        {"assignment_id": assignment_id},
        {"_id": 0}
    ).to_list(1000)
    return evaluations

@api_router.get("/evaluations/review-needed/{assignment_id}")
async def get_evaluations_review_needed(
    assignment_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    """
    Returns ALL evaluations for the assignment (not just flagged ones).
    Faculty should be able to review any student, regardless of confidence level.
    The frontend shows review-status badges to indicate which need attention.
    """
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    evaluations = await db.evaluations.find(
        {"assignment_id": assignment_id},
        {"_id": 0}
    ).to_list(1000)
    return evaluations

@api_router.get("/evaluations/student/{assignment_id}/{roll_number}")
async def get_student_evaluation(
    assignment_id: str,
    roll_number: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    evaluations = await db.evaluations.find(
        {"assignment_id": assignment_id, "roll_number": roll_number},
        {"_id": 0}
    ).to_list(1000)
    return evaluations

@api_router.put("/evaluations/{evaluation_id}/review")
async def review_evaluation(
    evaluation_id: str,
    final_marks: float = Form(...),
    faculty_comments: str = Form(None),
    current_faculty: dict = Depends(get_current_faculty)
):
    evaluation = await db.evaluations.find_one({"id": evaluation_id})
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    
    assignment = await db.assignments.find_one(
        {"id": evaluation["assignment_id"], "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    # ── FIX 3: standardise faculty-entered final marks too ──
    final_marks_std = standardise_marks(final_marks)

    await db.evaluations.update_one(
        {"id": evaluation_id},
        {"$set": {
            "final_marks": final_marks_std,
            "faculty_comments": faculty_comments,
            "reviewed": True,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
            "reviewed_by": current_faculty["id"]
        }}
    )
    
    updated = await db.evaluations.find_one({"id": evaluation_id}, {"_id": 0})
    return updated

@api_router.post("/evaluations/trigger/{assignment_id}")
async def trigger_evaluation(
    assignment_id: str,
    background_tasks: BackgroundTasks,
    current_faculty: dict = Depends(get_current_faculty)
):
    """Manually re-trigger evaluation for all uploaded scripts in an assignment."""
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return {"message": "Evaluation triggered", "assignment_id": assignment_id}

# ==================== RESULTS / EXPORT ENDPOINTS ====================

@api_router.get("/results/assignment/{assignment_id}")
async def get_results(
    assignment_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    evaluations = await db.evaluations.find(
        {"assignment_id": assignment_id},
        {"_id": 0}
    ).to_list(1000)
    
    student_results = {}
    for ev in evaluations:
        sname = ev["student_name"]
        roll = ev["roll_number"]
        key = f"{roll}_{sname}"
        
        if key not in student_results:
            student_results[key] = {
                "student_name": sname,
                "roll_number": roll,
                "total_marks": 0,
                "max_marks": 0,
                "evaluations": [],
                "needs_review": False
            }
        
        marks = ev.get("final_marks") if ev.get("reviewed") else ev.get("total_marks", 0)
        if marks is None:
            marks = ev.get("total_marks", 0)
        
        student_results[key]["total_marks"] += marks
        student_results[key]["max_marks"] += ev.get("max_marks", 0)
        student_results[key]["evaluations"].append(ev)
        
        if ev.get("needs_review") and not ev.get("reviewed"):
            student_results[key]["needs_review"] = True
    
    # Standardise totals in results
    for key in student_results:
        student_results[key]["total_marks"] = standardise_marks(
            student_results[key]["total_marks"]
        )
    
    return list(student_results.values())

@api_router.get("/results/export/{assignment_id}")
async def export_results(
    assignment_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    evaluations = await db.evaluations.find(
        {"assignment_id": assignment_id},
        {"_id": 0}
    ).to_list(1000)
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Results"
    
    ws.append([
        "Student Name", "Roll Number", "Question ID",
        "Total Marks", "Max Marks", "Confidence Score",
        "Needs Review", "Reviewed", "Final Marks", "Faculty Comments"
    ])
    
    for ev in evaluations:
        ws.append([
            ev["student_name"],
            ev["roll_number"],
            ev["question_id"],
            ev["total_marks"],
            ev["max_marks"],
            ev["confidence_score"],
            ev["needs_review"],
            ev["reviewed"],
            ev.get("final_marks", ""),
            ev.get("faculty_comments", "")
        ])
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=results_{assignment_id}.xlsx"}
    )

# ==================== DELETE STUDENT RECORDS ENDPOINT ====================

@api_router.delete("/student-records/{assignment_id}/{roll_number}")
async def delete_student_records(
    assignment_id: str,
    roll_number: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    """
    Delete ALL records for a specific student in an assignment.
    Removes: uploaded_scripts, student_answers, evaluations.
    Used by faculty to remove test uploads or wrongly added students.
    """
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Delete from all three collections
    r1 = await db.uploaded_scripts.delete_many({"assignment_id": assignment_id, "roll_number": roll_number})
    r2 = await db.student_answers.delete_many({"assignment_id": assignment_id, "roll_number": roll_number})
    r3 = await db.evaluations.delete_many({"assignment_id": assignment_id, "roll_number": roll_number})

    total = r1.deleted_count + r2.deleted_count + r3.deleted_count
    if total == 0:
        raise HTTPException(status_code=404, detail="No records found for this student")

    logger.info(f"Deleted records for roll={roll_number} in assignment={assignment_id}: {total} docs removed")
    return {
        "message": f"Deleted all records for student {roll_number}",
        "deleted": {"scripts": r1.deleted_count, "answers": r2.deleted_count, "evaluations": r3.deleted_count}
    }

# ==================== STATISTICS ENDPOINTS ====================

@api_router.get("/statistics/assignment/{assignment_id}")
async def get_assignment_statistics(
    assignment_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    total_questions = await db.questions.count_documents({"assignment_id": assignment_id})
    
    answers = await db.student_answers.find({"assignment_id": assignment_id}).to_list(1000)
    unique_students = len(set(a["student_name"] for a in answers))
    
    total_evaluations = await db.evaluations.count_documents({"assignment_id": assignment_id})
    needs_review = await db.evaluations.count_documents({
        "assignment_id": assignment_id,
        "needs_review": True,
        "reviewed": False
    })
    
    return {
        "assignment_id": assignment_id,
        "assignment_name": assignment["assignment_name"],
        "total_questions": total_questions,
        "total_students": unique_students,
        "total_evaluations": total_evaluations,
        "needs_review": needs_review,
        "completed": total_evaluations - needs_review
    }

# ==================== DASHBOARD ANALYTICS ENDPOINT ====================

@api_router.get("/dashboard/assignment/{assignment_id}")
async def get_dashboard_analytics(
    assignment_id: str,
    current_faculty: dict = Depends(get_current_faculty)
):
    """Comprehensive dashboard analytics for a specific assignment."""
    assignment = await db.assignments.find_one(
        {"id": assignment_id, "faculty_id": current_faculty["id"]}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    answers = await db.student_answers.find({"assignment_id": assignment_id}).to_list(1000)
    scripts_uploaded = len(set(a["student_name"] for a in answers))

    evaluations = await db.evaluations.find(
        {"assignment_id": assignment_id}, {"_id": 0}
    ).to_list(1000)

    evaluated_students = set(e["student_name"] for e in evaluations if e.get("student_name"))
    ai_evaluated = len(evaluated_students)

    review_students = set(
        e["student_name"] for e in evaluations
        if e.get("needs_review") and not e.get("reviewed") and e.get("student_name")
    )
    manual_review = len(review_students)

    student_totals     = {}   # semantic totals
    student_totals_llm = {}   # full-LLM totals (only populated if LLM marks exist)
    for ev in evaluations:
        sname = ev.get("student_name", "Unknown")
        total = ev.get("final_marks") if ev.get("reviewed") else ev.get("total_marks", 0)
        if total is None:
            total = ev.get("total_marks", 0)
        total_llm = ev.get("total_marks_llm")
        max_m = ev.get("max_marks", 0)
        if sname not in student_totals:
            student_totals[sname] = {"total": 0, "max": 0}
        student_totals[sname]["total"] += total
        student_totals[sname]["max"] += max_m
        # LLM totals — only aggregate if llm marks are available
        if total_llm is not None:
            if sname not in student_totals_llm:
                student_totals_llm[sname] = {"total": 0, "max": 0}
            student_totals_llm[sname]["total"] += min(total_llm, max_m)
            student_totals_llm[sname]["max"] += max_m

    # ── Score distribution: bucket by ACTUAL marks, not percentage ──────────
    # Maximum marks for this assignment (from the assignment document)
    max_marks_assignment = float(assignment.get("maximum_marks", 100))

    # Define 5 bands as actual mark thresholds based on assignment max marks
    # e.g. max=25 → bands: ≥22.5, ≥20, ≥17.5, ≥15, <15
    # (these correspond to 90%, 80%, 70%, 60%, <60% of max marks)
    b90 = max_marks_assignment * 0.90
    b80 = max_marks_assignment * 0.80
    b70 = max_marks_assignment * 0.70
    b60 = max_marks_assignment * 0.60

    def _fmt(v):
        return int(v) if v == int(v) else round(v, 1)

    mark_bands = {
        f"≥{_fmt(b90)}": 0,
        f"{_fmt(b80)}-{_fmt(b90)}": 0,
        f"{_fmt(b70)}-{_fmt(b80)}": 0,
        f"{_fmt(b60)}-{_fmt(b70)}": 0,
        f"<{_fmt(b60)}": 0,
    }
    band_keys = list(mark_bands.keys())

    score_distribution = {"90-100": 0, "80-90": 0, "70-80": 0, "60-70": 0, "<60": 0}
    for sname, data in student_totals.items():
        actual = data["total"]
        pct = (actual / data["max"] * 100) if data["max"] > 0 else 0
        if pct >= 90:
            score_distribution["90-100"] += 1
            mark_bands[band_keys[0]] += 1
        elif pct >= 80:
            score_distribution["80-90"] += 1
            mark_bands[band_keys[1]] += 1
        elif pct >= 70:
            score_distribution["70-80"] += 1
            mark_bands[band_keys[2]] += 1
        elif pct >= 60:
            score_distribution["60-70"] += 1
            mark_bands[band_keys[3]] += 1
        else:
            score_distribution["<60"] += 1
            mark_bands[band_keys[4]] += 1

    # ── LLM score distribution (only if full-LLM marks are available) ────────
    llm_has_data = len(student_totals_llm) > 0
    mark_bands_llm = {k: 0 for k in band_keys} if llm_has_data else None
    score_distribution_llm = {"90-100": 0, "80-90": 0, "70-80": 0, "60-70": 0, "<60": 0} if llm_has_data else None

    if llm_has_data:
        for sname, data in student_totals_llm.items():
            pct = (data["total"] / data["max"] * 100) if data["max"] > 0 else 0
            if pct >= 90:
                score_distribution_llm["90-100"] += 1
                mark_bands_llm[band_keys[0]] += 1
            elif pct >= 80:
                score_distribution_llm["80-90"] += 1
                mark_bands_llm[band_keys[1]] += 1
            elif pct >= 70:
                score_distribution_llm["70-80"] += 1
                mark_bands_llm[band_keys[2]] += 1
            elif pct >= 60:
                score_distribution_llm["60-70"] += 1
                mark_bands_llm[band_keys[3]] += 1
            else:
                score_distribution_llm["<60"] += 1
                mark_bands_llm[band_keys[4]] += 1

    questions = await db.questions.find(
        {"assignment_id": assignment_id}, {"_id": 0}
    ).sort("question_number", 1).to_list(1000)

    question_stats = {}
    for q in questions:
        question_stats[q["id"]] = {
            "question_number": q["question_number"],
            "question_text": q.get("question_text", "")[:80],
            "max_marks": q.get("marks", 10),
            "total_awarded": 0,
            "count": 0
        }

    for ev in evaluations:
        # question_id is on the evaluation document, NOT inside each concept_score
        qid = ev.get("question_id")
        if qid not in question_stats:
            continue
        for cs in ev.get("concept_scores", []):
            question_stats[qid]["total_awarded"] += cs.get("awarded_marks", 0)
        question_stats[qid]["count"] += 1  # count = number of students who answered this Q

    question_performance = []
    for qid, qs in question_stats.items():
        avg = round(qs["total_awarded"] / qs["count"], 1) if qs["count"] > 0 else None
        max_m = qs["max_marks"]
        if avg is not None and max_m > 0:
            ratio = avg / max_m
            difficulty = "Easy" if ratio >= 0.75 else ("Medium" if ratio >= 0.55 else "Hard")
        else:
            difficulty = "N/A"
        question_performance.append({
            "question_number": qs["question_number"],
            "question_text": qs["question_text"],
            "avg_score": avg,
            "max_marks": max_m,
            "difficulty": difficulty
        })

    question_performance.sort(key=lambda x: x["question_number"])

    lowest_q = None
    if question_performance:
        scored = [q for q in question_performance if q["avg_score"] is not None]
        if scored:
            lowest_q = min(scored, key=lambda x: (x["avg_score"] / x["max_marks"] if x["max_marks"] else 1))

    struggled_pct = None
    if lowest_q and ai_evaluated > 0:
        # Count students who scored < 50% on the lowest-performing question
        # ev["question_id"] tells us which question this evaluation belongs to
        below_half = 0
        for ev in evaluations:
            qid = ev.get("question_id")
            if not qid:
                continue
            qs_entry = question_stats.get(qid, {})
            if qs_entry.get("question_number") != lowest_q["question_number"]:
                continue
            # Sum concept marks for this evaluation
            awarded = sum(cs.get("awarded_marks", 0) for cs in ev.get("concept_scores", []))
            q_max   = qs_entry.get("max_marks", 1)
            if awarded < (q_max * 0.5):
                below_half += 1
        struggled_pct = round(below_half / ai_evaluated * 100) if ai_evaluated > 0 else 0

    top_students = []
    for sname, data in student_totals.items():
        pct = round(data["total"] / data["max"] * 100, 1) if data["max"] > 0 else 0
        top_students.append({"name": sname, "score": pct, "raw": round(data["total"], 1), "max": round(data["max"], 1)})
    top_students.sort(key=lambda x: x["score"], reverse=True)
    top_students = top_students[:5]

    overall_avg = None
    if student_totals:
        all_pcts = [round(d["total"] / d["max"] * 100, 1) for d in student_totals.values() if d["max"] > 0]
        overall_avg = round(sum(all_pcts) / len(all_pcts), 1) if all_pcts else None

    # ── LLM-based insights (mirrors semantic logic but uses awarded_marks_llm) ─
    lowest_q_llm    = None
    struggled_pct_llm = None
    overall_avg_llm = None

    if llm_has_data:
        # Per-question LLM stats
        q_stats_llm = {qid: {"question_number": v["question_number"],
                              "question_text": v["question_text"],
                              "max_marks": v["max_marks"],
                              "total_awarded": 0, "count": 0}
                       for qid, v in question_stats.items()}

        for ev in evaluations:
            qid = ev.get("question_id")
            if qid not in q_stats_llm:
                continue
            llm_sum = sum(cs.get("awarded_marks_llm") or cs.get("awarded_marks", 0)
                          for cs in ev.get("concept_scores", []))
            q_stats_llm[qid]["total_awarded"] += min(llm_sum, q_stats_llm[qid]["max_marks"])
            q_stats_llm[qid]["count"] += 1

        qp_llm = []
        for qid, qs in q_stats_llm.items():
            avg_l = round(qs["total_awarded"] / qs["count"], 1) if qs["count"] > 0 else None
            if avg_l is not None and qs["max_marks"] > 0:
                ratio = avg_l / qs["max_marks"]
                diff  = "Easy" if ratio >= 0.75 else ("Medium" if ratio >= 0.55 else "Hard")
            else:
                diff = "N/A"
            qp_llm.append({"question_number": qs["question_number"],
                            "question_text": qs["question_text"],
                            "avg_score": avg_l, "max_marks": qs["max_marks"], "difficulty": diff})

        scored_llm = [q for q in qp_llm if q["avg_score"] is not None]
        if scored_llm:
            lowest_q_llm = min(scored_llm,
                               key=lambda x: x["avg_score"] / x["max_marks"] if x["max_marks"] else 1)

        if lowest_q_llm and ai_evaluated > 0:
            below = 0
            for ev in evaluations:
                qid = ev.get("question_id")
                if not qid or q_stats_llm.get(qid, {}).get("question_number") != lowest_q_llm["question_number"]:
                    continue
                llm_sum = sum(cs.get("awarded_marks_llm") or cs.get("awarded_marks", 0)
                              for cs in ev.get("concept_scores", []))
                if llm_sum < (q_stats_llm[qid]["max_marks"] * 0.5):
                    below += 1
            struggled_pct_llm = round(below / ai_evaluated * 100)

        if student_totals_llm:
            llm_pcts = [round(d["total"] / d["max"] * 100, 1)
                        for d in student_totals_llm.values() if d["max"] > 0]
            overall_avg_llm = round(sum(llm_pcts) / len(llm_pcts), 1) if llm_pcts else None

    return {
        "assignment_name": assignment.get("assignment_name"),
        "maximum_marks": max_marks_assignment,
        "evaluation_progress": {
            "scripts_uploaded": scripts_uploaded,
            "ai_evaluated": ai_evaluated,
            "manual_review": manual_review,
            "percent_evaluated": round(ai_evaluated / scripts_uploaded * 100) if scripts_uploaded > 0 else 0
        },
        "score_distribution": score_distribution,
        "mark_bands": mark_bands,
        "score_distribution_llm": score_distribution_llm,
        "mark_bands_llm": mark_bands_llm,
        "question_performance": question_performance,
        "top_students": top_students,
        "overall_avg": overall_avg,
        "ai_insights": {
            "lowest_question": lowest_q,
            "struggled_percent": struggled_pct,
            "overall_avg": overall_avg,
        },
        "ai_insights_llm": {
            "lowest_question": lowest_q_llm,
            "struggled_percent": struggled_pct_llm,
            "overall_avg": overall_avg_llm,
        } if llm_has_data else None
    }

# Include API router
app.include_router(api_router)

# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "EvalMate API", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.environ.get('HOST', '0.0.0.0'),
        port=int(os.environ.get('PORT', 8000)),
        reload=os.environ.get('RELOAD', 'true').lower() == 'true'
    )