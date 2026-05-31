#!/usr/bin/env python3
"""Clear coding round history while preserving question bank and LLM config.

Dry-run by default:
    python scripts/clear_round_history.py

Apply deletion:
    python scripts/clear_round_history.py --yes

Active sessions are protected unless --force-active is supplied.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func
from sqlmodel import select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import async_session, engine  # noqa: E402
from app.models import (  # noqa: E402
    ChatMessage,
    InterviewReport,
    Room,
    RoomQuestionLink,
    Session,
    SessionQuestionCode,
    TelemetryEvent,
)


HISTORY_MODELS = [
    ("telemetry_events", TelemetryEvent),
    ("interview_reports", InterviewReport),
    ("chat_messages", ChatMessage),
    ("session_question_codes", SessionQuestionCode),
    ("sessions", Session),
    ("room_questions", RoomQuestionLink),
    ("rooms", Room),
]


async def count_rows(db: Any, model: type[Any]) -> int:
    result = await db.exec(select(func.count()).select_from(model))
    return int(result.one())


async def count_active_sessions(db: Any) -> int:
    result = await db.exec(select(func.count()).select_from(Session).where(Session.status == "active"))
    return int(result.one())


async def collect_counts(db: Any) -> dict[str, int]:
    return {name: await count_rows(db, model) for name, model in HISTORY_MODELS}


def print_counts(title: str, counts: dict[str, int]) -> None:
    print(title)
    for name, count in counts.items():
        print(f"  {name}: {count}")


async def clear_history(*, apply: bool, force_active: bool) -> int:
    async with async_session() as db:
        before = await collect_counts(db)
        active_sessions = await count_active_sessions(db)

        print_counts("Round history rows found:", before)
        print(f"  active_sessions: {active_sessions}")

        if not any(before.values()):
            print("No round history rows to clear.")
            return 0

        if active_sessions and not force_active:
            print(
                "\nRefusing to clear history because active sessions exist. "
                "End them first or rerun with --force-active."
            )
            return 2

        if not apply:
            print("\nDry run only. Rerun with --yes to delete these rows.")
            return 0

        for _name, model in HISTORY_MODELS:
            await db.exec(delete(model))
        await db.commit()

        after = await collect_counts(db)
        print_counts("\nRound history rows after delete:", after)
        print("\nCleared round history. Preserved questions, organizations, and LLM configuration.")
        return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Clear coding round history tables from the configured database. "
            "Question bank rows and LLM configuration are preserved."
        )
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Actually delete rows. Without this flag the script only prints counts.",
    )
    parser.add_argument(
        "--force-active",
        action="store_true",
        help="Allow deletion even when active sessions exist.",
    )
    return parser.parse_args()


async def main() -> int:
    args = parse_args()
    try:
        return await clear_history(apply=args.yes, force_active=args.force_active)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
