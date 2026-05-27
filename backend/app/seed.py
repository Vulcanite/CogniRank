from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import settings
from app.models import AIConfiguration, Question, Room, Session, utc_now
from app.services.ai import DEFAULT_REPORT_PROMPT, SYSTEM_PROMPT, DEFAULT_AI_URL
from app.services.code_snapshots import ensure_question_code_rows
from app.services.questions import get_room_questions

SEEDED_QUESTIONS = [
    {
        "slug": "two-sum-indices",
        "title": "Two Sum Indices",
        "difficulty": "Easy",
        "tags": "hash-map,array",
        "prompt": (
            "Given an array of integers and a target value, return the indices of two "
            "distinct numbers that add up to the target. You may assume exactly one "
            "valid pair exists."
        ),
        "sample_input_output": "Input: nums = [2, 7, 11, 15], target = 9\nOutput: [0, 1]",
        "starter_code": (
            "import sys\n\n"
            "def solve(nums, target):\n"
            "    # Explain your approach before filling this in.\n"
            "    pass\n\n"
            "def main():\n"
            "    data = sys.stdin.read().strip().split()\n"
            "    if not data:\n"
            "        return\n"
            "    target = int(data[-1])\n"
            "    nums = [int(x) for x in data[:-1]]\n"
            "    print(solve(nums, target))\n\n"
            "if __name__ == \"__main__\":\n"
            "    main()\n"
        ),
    },
    {
        "slug": "valid-parentheses",
        "title": "Valid Parentheses",
        "difficulty": "Easy",
        "tags": "stack,string",
        "prompt": (
            "Given a string containing only brackets '(', ')', '{', '}', '[' and ']', "
            "determine whether the brackets are balanced and closed in the correct order."
        ),
        "sample_input_output": 'Input: s = "([{}])"\nOutput: true',
        "starter_code": (
            "import sys\n\n"
            "def is_valid(s):\n"
            "    # Explain which structure tracks open brackets.\n"
            "    pass\n\n"
            "def main():\n"
            "    s = sys.stdin.read().strip()\n"
            "    print(str(is_valid(s)).lower())\n\n"
            "if __name__ == \"__main__\":\n"
            "    main()\n"
        ),
    },
    {
        "slug": "merge-intervals",
        "title": "Merge Intervals",
        "difficulty": "Medium",
        "tags": "sorting,intervals",
        "prompt": (
            "Given a list of intervals, merge all overlapping intervals and return a "
            "list of non-overlapping intervals sorted by start time."
        ),
        "sample_input_output": "Input: [[1,3],[2,6],[8,10],[15,18]]\nOutput: [[1,6],[8,10],[15,18]]",
        "starter_code": (
            "import ast\n"
            "import sys\n\n"
            "def merge(intervals):\n"
            "    # State how ordering helps before coding the merge.\n"
            "    pass\n\n"
            "def main():\n"
            "    raw = sys.stdin.read().strip()\n"
            "    intervals = ast.literal_eval(raw) if raw else []\n"
            "    print(merge(intervals))\n\n"
            "if __name__ == \"__main__\":\n"
            "    main()\n"
        ),
    },
    {
        "slug": "first-non-repeating-character",
        "title": "First Non-Repeating Character",
        "difficulty": "Easy",
        "tags": "hash-map,string",
        "prompt": (
            "Given a lowercase string, return the index of the first character that "
            "appears exactly once. Return -1 if every character repeats."
        ),
        "sample_input_output": 'Input: s = "leetcode"\nOutput: 0',
        "starter_code": (
            "import sys\n\n"
            "def first_unique_char(s):\n"
            "    # Explain how you will count and preserve order.\n"
            "    pass\n\n"
            "def main():\n"
            "    s = sys.stdin.read().strip()\n"
            "    print(first_unique_char(s))\n\n"
            "if __name__ == \"__main__\":\n"
            "    main()\n"
        ),
    },
    {
        "slug": "top-k-frequent-elements",
        "title": "Top K Frequent Elements",
        "difficulty": "Medium",
        "tags": "heap,hash-map,bucket-sort",
        "prompt": (
            "Given an integer array and a number k, return the k most frequent elements. "
            "The answer may be returned in any order."
        ),
        "sample_input_output": "Input: nums = [1,1,1,2,2,3], k = 2\nOutput: [1,2]",
        "starter_code": (
            "import sys\n\n"
            "def top_k_frequent(nums, k):\n"
            "    # Explain how frequency and ranking will be represented.\n"
            "    pass\n\n"
            "def main():\n"
            "    data = [int(x) for x in sys.stdin.read().strip().split()]\n"
            "    if not data:\n"
            "        return\n"
            "    k = data[-1]\n"
            "    nums = data[:-1]\n"
            "    print(top_k_frequent(nums, k))\n\n"
            "if __name__ == \"__main__\":\n"
            "    main()\n"
        ),
    },
    {
        "slug": "minimum-window-substring-lite",
        "title": "Minimum Covering Window",
        "difficulty": "Hard",
        "tags": "sliding-window,hash-map,string",
        "prompt": (
            "Given two strings source and target, return the smallest substring of "
            "source that contains every character from target, including duplicates. "
            "Return an empty string if no such window exists."
        ),
        "sample_input_output": 'Input: source = "ADOBECODEBANC", target = "ABC"\nOutput: "BANC"',
        "starter_code": (
            "import sys\n\n"
            "def min_window(source, target):\n"
            "    # Explain what the moving window must maintain.\n"
            "    pass\n\n"
            "def main():\n"
            "    lines = [line.rstrip(\"\\n\") for line in sys.stdin.readlines()]\n"
            "    source = lines[0] if lines else \"\"\n"
            "    target = lines[1] if len(lines) > 1 else \"\"\n"
            "    print(min_window(source, target))\n\n"
            "if __name__ == \"__main__\":\n"
            "    main()\n"
        ),
    },
]


async def seed_questions(db: AsyncSession) -> None:
    for item in SEEDED_QUESTIONS:
        result = await db.exec(select(Question).where(Question.slug == item["slug"]))
        existing = result.first()
        if existing is not None:
            if not existing.starter_code:
                existing.starter_code = item["starter_code"]
                db.add(existing)
            continue
        db.add(Question(**item))

    config_result = await db.exec(select(AIConfiguration).where(AIConfiguration.id == "default"))
    config = config_result.first()
    if config is None:
        db.add(
            AIConfiguration(
                api_url=DEFAULT_AI_URL,
                model=settings.openrouter_model,
                system_prompt=SYSTEM_PROMPT,
                report_prompt=DEFAULT_REPORT_PROMPT,
                force_brute_force=False,
                reasoning_enabled=False,
                reasoning_config_json="{}",
            )
        )

    room_result = await db.exec(select(Room))
    for room in room_result.all():
        if not room.invite_email:
            continue
        session_result = await db.exec(select(Session).where(Session.room_id == room.id))
        if session_result.first() is not None:
            continue
        now = utc_now()
        questions = await get_room_questions(room.id, db)
        inactive_session = Session(
            room_id=room.id,
            candidate_email=room.invite_email,
            candidate_name="Pending candidate",
            current_code="\n\n".join(
                f"# {question.title}\n{question.starter_code.strip()}"
                for question in questions
                if question.starter_code.strip()
            ),
            status="inactive",
            started_at=now,
            updated_at=now,
            expires_at=None,
        )
        db.add(inactive_session)
        await db.flush()
        await ensure_question_code_rows(inactive_session.id, questions, db)
    await db.commit()
