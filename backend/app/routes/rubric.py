from fastapi import APIRouter
from app.models import assignments

router = APIRouter()

@router.post("/{assignment_id}")
def save_rubric(assignment_id: str, data: dict):
    assignments[assignment_id]["rubric"] = data
    return {"status": "saved"}
