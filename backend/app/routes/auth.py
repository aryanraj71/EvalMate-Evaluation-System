from fastapi import APIRouter

router = APIRouter()

@router.post("/login")
def login(data: dict):
    if data["email"] == "faculty@evalmate.com" and data["password"] == "admin123":
        return {"success": True}
    return {"success": False}
