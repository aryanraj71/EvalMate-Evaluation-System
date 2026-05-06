
import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from sklearn.metrics import cohen_kappa_score, mean_absolute_error, accuracy_score
import numpy as np
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path

# --- Configuration ---
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / 'backend' / 'app' / '.env')

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'evalmate')

async def calculate_metrics():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    print(f"Connecting to database: {DB_NAME} at {MONGO_URL}")

    # 1. Get all assignments
    assignments = await db.assignments.find({}, {"_id": 0}).to_list(100)
    if not assignments:
        print("No assignments found in database.")
        return

    print("\n" + "="*50)
    print("             ASSIGNMENT SUMMARY")
    print("="*50)
    print(f"{'Assignment Name':<25} | {'Reviews':<8} | {'Total':<8}")
    print("-" * 50)
    for a in assignments:
        reviewed_count = await db.evaluations.count_documents({"assignment_id": a["id"], "reviewed": True})
        total_count = await db.evaluations.count_documents({"assignment_id": a["id"]})
        print(f"{a['assignment_name'][:25]:<25} | {reviewed_count:<8} | {total_count:<8}")
    print("="*50)

    import sys
    target_name = sys.argv[1] if len(sys.argv) > 1 else None
    target_assignment = None

    if target_name:
        for a in assignments:
            if target_name.lower() in a["assignment_name"].lower():
                target_assignment = a
                break
    
    if not target_assignment:
        # Fallback to one with most reviews
        max_reviews_found = -1
        for a in assignments:
            count = await db.evaluations.count_documents({"assignment_id": a["id"], "reviewed": True})
            if count > max_reviews_found:
                max_reviews_found = count
                target_assignment = a
        max_reviews = max_reviews_found
    else:
        max_reviews = await db.evaluations.count_documents({"assignment_id": target_assignment["id"], "reviewed": True})

    if not target_assignment or max_reviews == 0:
        print(f"\n[!] No reviewed evaluations found for '{target_name if target_name else 'any assignment'}'.")
        print("    Please review some answers in the dashboard to generate ground truth marks.")
        return

    print(f"\n>>> ANALYZING: {target_assignment['assignment_name']}")
    print(f">>> Ground Truth Samples: {max_reviews}")

    # 2. Fetch data
    evals = await db.evaluations.find({"assignment_id": target_assignment["id"], "reviewed": True}).to_list(10000)
    
    y_true = [] # Human marks (Ground Truth)
    y_sem = []  # Semantic Only
    y_hyb = []  # Semantic + LLM (Hybrid - default)
    y_llm = []  # Full AI (LLM Only)
    
    for e in evals:
        ground_truth = e.get("final_marks")
        sem_score = e.get("total_marks_sem") # Pure Semantic
        hyb_score = e.get("total_marks")     # Hybrid (Semantic + Selective LLM)
        llm_score = e.get("total_marks_llm") # Full LLM
        
        if sem_score is None: sem_score = hyb_score if hyb_score is not None else 0.0
        if hyb_score is None: hyb_score = 0.0
        if llm_score is None: llm_score = hyb_score
        
        if ground_truth is not None:
            y_true.append(ground_truth)
            y_sem.append(sem_score)
            y_hyb.append(hyb_score)
            y_llm.append(llm_score)

    y_true = np.array(y_true)
    y_sem = np.array(y_sem)
    y_hyb = np.array(y_hyb)
    y_llm = np.array(y_llm)

    def to_categories(arr):
        return (np.array(arr) * 2).astype(int)

    cat_true = to_categories(y_true)
    
    def get_stats(y_pred):
        cat_pred = to_categories(y_pred)
        if len(set(cat_pred)) <= 1 and len(set(cat_true)) <= 1:
            qwk = 1.0 if cat_pred[0] == cat_true[0] else 0.0
        else:
            qwk = cohen_kappa_score(cat_true, cat_pred, weights='quadratic')
        
        mae = mean_absolute_error(y_true, y_pred)
        acc = accuracy_score(cat_true, cat_pred)
        off = np.mean(np.abs(cat_true - cat_pred) <= 1)
        return qwk, mae, acc, off

    m_sem = get_stats(y_sem)
    m_hyb = get_stats(y_hyb)
    m_llm = get_stats(y_llm)
    
    tau = 0.75
    y_hitl = np.array([ (e.get("total_marks") if e.get("confidence_score", 1.0) >= tau else e.get("final_marks")) for e in evals ])
    m_hitl = get_stats(y_hitl)
    auto_pct = np.mean([1 if e.get("confidence_score", 1.0) >= tau else 0 for e in evals]) * 100

    print("\n" + "="*50)
    print("             EXPERIMENTAL RESULTS")
    print("="*50)
    print(f"{'Metric':<15} | {'Semantic':<10} | {'Sem+LLM':<10} | {'Full AI':<10} | {'HITL':<10}")
    print("-" * 65)
    print(f"{'QWK':<15} | {m_sem[0]:<10.3f} | {m_hyb[0]:<10.3f} | {m_llm[0]:<10.3f} | {m_hitl[0]:<10.3f}")
    print(f"{'MAE':<15} | {m_sem[1]:<10.3f} | {m_hyb[1]:<10.3f} | {m_llm[1]:<10.3f} | {m_hitl[1]:<10.3f}")
    print(f"{'Exact Acc':<15} | {m_sem[2]*100:<9.1f}% | {m_hyb[2]*100:<9.1f}% | {m_llm[2]*100:<9.1f}% | {m_hitl[2]*100:<9.1f}%")

    print("\n\n" + "="*50)
    print("         LATEX TABLES FOR YOUR PAPER")
    print("="*50)
    
    print("\n--- [Table I: Overall Performance] ---")
    print(f"""
\\begin{{table}}[htbp]
  \\caption{{Performance: AI Tracks vs.\\ HITL vs.\\ Human--Human}}
  \\label{{tab:overall}}
  \\centering
  \\begin{{tabular}}{{lcccc}}
    \\toprule
    \\textbf{{Metric}} & \\textbf{{Semantic}} & \\textbf{{Sem+LLM}} & \\textbf{{Full AI}} & \\textbf{{HITL}} \\\\
    \\midrule
    QWK                & {m_sem[0]:.2f} & {m_hyb[0]:.2f} & {m_llm[0]:.2f} & \\textbf{{{m_hitl[0]:.2f}}} \\\\
    Exact Match Acc.   & {m_sem[2]*100:.1f}\\% & {m_hyb[2]*100:.1f}\\% & {m_llm[2]*100:.1f}\\% & \\textbf{{{m_hitl[2]*100:.1f}\\%}} \\\\
    MAE (marks)        & {m_sem[1]:.2f} & {m_hyb[1]:.2f} & {m_llm[1]:.2f} & \\textbf{{{m_hitl[1]:.2f}}} \\\\
    Auto-Graded        & 100\\% & 100\\% & 100\\% & {auto_pct:.0f}\\% \\\\
    \\bottomrule
  \\end{{tabular}}
\\end{{table}}
""")

    print("\n--- [Table II: Coverage vs Accuracy (Hybrid Track)] ---")
    print("\\begin{table}[htbp]")
    print("  \\caption{Coverage vs.\\ Accuracy Across Confidence Thresholds}")
    print("  \\label{tab:threshold}")
    print("  \\centering")
    print("  \\begin{tabular}{cccc}")
    print("    \\toprule")
    print("    \\textbf{$\\tau$} & \\textbf{Auto\\%} & \\textbf{Review\\%} & \\textbf{QWK (HITL)} \\\\")
    print("    \\midrule")
    for t in [0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.50]:
        y_t_hitl = np.array([ (e.get("total_marks") if e.get("confidence_score", 1.0) >= t else e.get("final_marks")) for e in evals ])
        qwk_t = cohen_kappa_score(cat_true, to_categories(y_t_hitl), weights='quadratic') if len(set(cat_true)) > 1 else 1.0
        auto_mask = [1 if e.get("confidence_score", 1.0) >= t else 0 for e in evals]
        auto_p = np.mean(auto_mask) * 100
        flag = "$^\\dag$" if t == 0.75 else ""
        print(f"    {t:.2f}{flag} & {auto_p:.0f}\\% & {100-auto_p:.0f}\\% & {qwk_t:.2f} \\\\")
    print("    \\bottomrule")
    print("  \\end{tabular}")
    print("\\end{table}")

    print("\n--- [Table IV: Per-Question Breakdown] ---")
    q_data = {}
    for e in evals:
        qid = e["question_id"]
        if qid not in q_data: q_data[qid] = {"true": [], "sem": [], "hyb": [], "llm": [], "flagged": 0}
        
        ground_truth = e.get("final_marks")
        hyb_score = e.get("total_marks", 0.0)
        sem_score = e.get("total_marks_sem", hyb_score)
        llm_score = e.get("total_marks_llm", hyb_score)
        
        if hyb_score is None: hyb_score = 0.0
        if sem_score is None: sem_score = 0.0
        if llm_score is None: llm_score = 0.0

        q_data[qid]["true"].append(ground_truth)
        q_data[qid]["sem"].append(sem_score)
        q_data[qid]["hyb"].append(hyb_score)
        q_data[qid]["llm"].append(llm_score)
        
        if e.get("confidence_score", 1.0) < 0.75: q_data[qid]["flagged"] += 1

    questions = await db.questions.find({"assignment_id": target_assignment["id"]}).to_list(100)
    q_info = {q["id"]: q for q in questions}

    print("\\begin{table}[htbp]")
    print("  \\caption{Per-Question Performance: Semantic vs.\\ Hybrid vs.\\ LLM}")
    print("  \\centering")
    print("  \\begin{tabular}{lcccc}")
    print("    \\toprule")
    print("    \\textbf{Q} & \\textbf{Sem QWK} & \\textbf{Hyb QWK} & \\textbf{LLM QWK} & \\textbf{Flagged} \\\\")
    print("    \\midrule")
    for qid in sorted(q_data.keys(), key=lambda x: q_info.get(x, {}).get("question_number", 0)):
        d = q_data[qid]
        q_num = q_info.get(qid, {}).get("question_number", "?")
        
        def q_qwk(y_p):
            c_t = to_categories(d["true"])
            c_p = to_categories(y_p)
            return cohen_kappa_score(c_t, c_p, weights='quadratic') if len(set(c_t)) > 1 else 1.0

        print(f"    Q{q_num} & {q_qwk(d['sem']):.2f} & {q_qwk(d['hyb']):.2f} & {q_qwk(d['llm']):.2f} & { (d['flagged']/len(d['true']))*100 :.0f}\\% \\\\")
    print("    \\bottomrule")
    print("  \\end{tabular}")
    print("\\end{table}")

    client.close()

if __name__ == "__main__":
    asyncio.run(calculate_metrics())
