import random
import string

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Room


def generate_room_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choices(alphabet, k=length))


async def create_unique_room_code(db: AsyncSession, length: int = 6) -> str:
    for _ in range(20):
        code = generate_room_code(length)
        result = await db.exec(select(Room).where(Room.room_code == code))
        if result.first() is None:
            return code
    raise RuntimeError("Unable to generate a unique room code")
