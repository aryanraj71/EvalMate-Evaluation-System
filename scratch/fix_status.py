import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def fix():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['evalmate']
    res = await db.evaluations.update_many(
        {'reviewed': True}, 
        {'$set': {'needs_review': False}}
    )
    print(f'Successfully updated {res.modified_count} reviewed evaluations to status "Evaluated".')
    client.close()

if __name__ == "__main__":
    asyncio.run(fix())
