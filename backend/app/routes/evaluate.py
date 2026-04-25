from fastapi import APIRouter, UploadFile
import random

router = APIRouter()

@router.post("/{assignment_id}")
async def evaluate_answer(assignment_id: str, file: UploadFile):
    confidence = round(random.uniform(0.4, 0.95), 2)

    return {
        "confidence": confidence,
        "needs_human": confidence < 0.75
    }
