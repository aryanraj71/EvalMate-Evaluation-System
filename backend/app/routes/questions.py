from fastapi import APIRouter, UploadFile
import easyocr

router = APIRouter()
reader = easyocr.Reader(['en'])

@router.post("/{assignment_id}/upload")
async def upload_questions(assignment_id: str, file: UploadFile):
    text = reader.readtext(await file.read(), detail=0)
    return {"questions": text}
