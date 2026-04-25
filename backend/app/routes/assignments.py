from fastapi import APIRouter
import uuid
from app.models import assignments

router = APIRouter()

@router.post("/create")
def create_assignment(data: dict):
    aid = str(uuid.uuid4())
    assignments[aid] = {
        "name": data["name"],
        "questions": [],
        "rubric": {},
        "answers": []
    }
    return {"assignment_id": aid}
