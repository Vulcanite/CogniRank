import asyncio
import uuid
from collections import defaultdict
from typing import Any

LiveCodeEvent = dict[str, Any]

class LiveCodeHub:
    def __init__(self) -> None:
        self._subscribers: dict[uuid.UUID, set[asyncio.Queue[LiveCodeEvent]]] = defaultdict(set)

    def subscribe(self, session_id: uuid.UUID) -> asyncio.Queue[LiveCodeEvent]:
        queue: asyncio.Queue[LiveCodeEvent] = asyncio.Queue(maxsize=100)
        self._subscribers[session_id].add(queue)
        return queue

    def unsubscribe(self, session_id: uuid.UUID, queue: asyncio.Queue[LiveCodeEvent]) -> None:
        subscribers = self._subscribers.get(session_id)
        if subscribers is None:
            return
        subscribers.discard(queue)
        if not subscribers:
            self._subscribers.pop(session_id, None)

    def publish(self, session_id: uuid.UUID, event: LiveCodeEvent) -> None:
        for queue in tuple(self._subscribers.get(session_id, ())):
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(event)


live_code_hub = LiveCodeHub()
