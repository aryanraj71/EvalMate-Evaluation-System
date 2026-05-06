import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['evalmate']
    print("Assignments Status:")
    async for a in db.assignments.find():
        reviewed = await db.evaluations.count_documents({"assignment_id": a["id"], "reviewed": True})
        with_final = await db.evaluations.count_documents({"assignment_id": a["id"], "final_marks": {"$ne": None}})
        total = await db.evaluations.count_documents({"assignment_id": a["id"]})
        print(f"- {a['assignment_name']} (ID: {a['id']}): {reviewed} reviews (flag) / {with_final} with final_marks / {total} total")
    client.close()

if __name__ == "__main__":
    asyncio.run(check())
