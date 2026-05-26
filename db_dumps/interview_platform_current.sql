--
-- PostgreSQL database dump
--

\restrict lfWVqJcLYSMZWj1mc8pLNGV97Zj6a7y6aYDjkoydXN2EfXeVHiLJwt5Y8I6mNkt

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY "public"."telemetry_events" DROP CONSTRAINT IF EXISTS "telemetry_events_session_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."sessions" DROP CONSTRAINT IF EXISTS "sessions_room_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."session_question_codes" DROP CONSTRAINT IF EXISTS "session_question_codes_session_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."session_question_codes" DROP CONSTRAINT IF EXISTS "session_question_codes_question_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."rooms" DROP CONSTRAINT IF EXISTS "rooms_org_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."room_questions" DROP CONSTRAINT IF EXISTS "room_questions_room_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."room_questions" DROP CONSTRAINT IF EXISTS "room_questions_question_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."interview_reports" DROP CONSTRAINT IF EXISTS "interview_reports_session_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."chat_messages" DROP CONSTRAINT IF EXISTS "chat_messages_session_id_fkey";
DROP INDEX IF EXISTS "public"."ix_telemetry_events_event_type";
DROP INDEX IF EXISTS "public"."ix_rooms_room_code";
DROP INDEX IF EXISTS "public"."ix_questions_slug";
ALTER TABLE IF EXISTS ONLY "public"."telemetry_events" DROP CONSTRAINT IF EXISTS "telemetry_events_pkey";
ALTER TABLE IF EXISTS ONLY "public"."sessions" DROP CONSTRAINT IF EXISTS "sessions_pkey";
ALTER TABLE IF EXISTS ONLY "public"."session_question_codes" DROP CONSTRAINT IF EXISTS "session_question_codes_pkey";
ALTER TABLE IF EXISTS ONLY "public"."rooms" DROP CONSTRAINT IF EXISTS "rooms_pkey";
ALTER TABLE IF EXISTS ONLY "public"."room_questions" DROP CONSTRAINT IF EXISTS "room_questions_pkey";
ALTER TABLE IF EXISTS ONLY "public"."questions" DROP CONSTRAINT IF EXISTS "questions_pkey";
ALTER TABLE IF EXISTS ONLY "public"."organizations" DROP CONSTRAINT IF EXISTS "organizations_pkey";
ALTER TABLE IF EXISTS ONLY "public"."interview_reports" DROP CONSTRAINT IF EXISTS "interview_reports_session_id_key";
ALTER TABLE IF EXISTS ONLY "public"."interview_reports" DROP CONSTRAINT IF EXISTS "interview_reports_pkey";
ALTER TABLE IF EXISTS ONLY "public"."chat_messages" DROP CONSTRAINT IF EXISTS "chat_messages_pkey";
ALTER TABLE IF EXISTS ONLY "public"."ai_configuration" DROP CONSTRAINT IF EXISTS "ai_configuration_pkey";
DROP TABLE IF EXISTS "public"."telemetry_events";
DROP TABLE IF EXISTS "public"."sessions";
DROP TABLE IF EXISTS "public"."session_question_codes";
DROP TABLE IF EXISTS "public"."rooms";
DROP TABLE IF EXISTS "public"."room_questions";
DROP TABLE IF EXISTS "public"."questions";
DROP TABLE IF EXISTS "public"."organizations";
DROP TABLE IF EXISTS "public"."interview_reports";
DROP TABLE IF EXISTS "public"."chat_messages";
DROP TABLE IF EXISTS "public"."ai_configuration";
--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: ai_configuration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_configuration" (
    "id" character varying(40) NOT NULL,
    "api_url" character varying NOT NULL,
    "model" character varying NOT NULL,
    "system_prompt" "text" NOT NULL,
    "report_prompt" "text" NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "force_brute_force" boolean DEFAULT false NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chat_messages" (
    "id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "role" character varying(20) NOT NULL,
    "message" "text" NOT NULL,
    "timestamp" timestamp with time zone NOT NULL
);


--
-- Name: interview_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."interview_reports" (
    "id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "summary" "text" NOT NULL,
    "recommendation" character varying(40) NOT NULL,
    "rubric_json" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."organizations" (
    "id" "uuid" NOT NULL,
    "name" character varying NOT NULL
);


--
-- Name: questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."questions" (
    "id" "uuid" NOT NULL,
    "slug" character varying NOT NULL,
    "title" character varying NOT NULL,
    "difficulty" character varying(20) NOT NULL,
    "prompt" "text" NOT NULL,
    "sample_input_output" "text" NOT NULL,
    "tags" character varying NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "starter_code" "text" DEFAULT ''::"text" NOT NULL
);


--
-- Name: room_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."room_questions" (
    "room_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "order_index" integer NOT NULL
);


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."rooms" (
    "id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "room_code" character varying(6) NOT NULL,
    "title" character varying NOT NULL,
    "problem_statement" "text" NOT NULL,
    "sample_input_output" "text" NOT NULL,
    "max_tokens" integer NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "invite_email" character varying,
    "duration_minutes" integer DEFAULT 60 NOT NULL
);


--
-- Name: session_question_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."session_question_codes" (
    "session_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "current_code" "text" NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."sessions" (
    "id" "uuid" NOT NULL,
    "room_id" "uuid" NOT NULL,
    "candidate_email" character varying NOT NULL,
    "candidate_name" character varying NOT NULL,
    "current_code" "text" NOT NULL,
    "tokens_used" integer NOT NULL,
    "token_limit_hit" boolean NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "status" character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "candidate_access_token_hash" character varying(128),
    "active_client_id" character varying(128),
    "client_lease_expires_at" timestamp with time zone
);


--
-- Name: telemetry_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."telemetry_events" (
    "id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "event_type" character varying(80) NOT NULL,
    "metadata_json" "text" NOT NULL,
    "timestamp" timestamp with time zone NOT NULL
);


--
-- Data for Name: ai_configuration; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."ai_configuration" ("id", "api_url", "model", "system_prompt", "report_prompt", "updated_at", "force_brute_force") FROM stdin;
default	https://openrouter.ai/api/v1/chat/completions	poolside/laguna-xs.2:free	You are an unyielding foundational gatekeeper assessing an entry-level programmer.\nCRITICAL DIRECTIVE: You do not know the solution. You are forbidden from writing functional loops, conditionals, or working algorithms until the candidate has explicitly named a valid data structure or algorithmic approach and given a basic logical justification.\n\n- If the candidate asks you to code it right away, refuse politely and remind them to state their high-level strategy and 'why' it works.\n- If their approach is completely wrong (e.g., using Binary Search on an unsorted list), point out the real-world consequence of their error and ask them to reconsider. Do not give them the right answer.\n- Keep your remarks under 3 sentences. Be a helpful but stubborn peer.	Generate a concise interview report from the candidate's final code, chat transcript, question set, and token usage.\nAssess algorithmic reasoning, communication, code completeness, and independence. Do not invent runtime results.\nReturn clear strengths, concerns, and a practical hiring recommendation.	2026-05-26 23:46:18.874076+08	t
\.


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."chat_messages" ("id", "session_id", "role", "message", "timestamp") FROM stdin;
\.


--
-- Data for Name: interview_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."interview_reports" ("id", "session_id", "summary", "recommendation", "rubric_json", "created_at") FROM stdin;
\.


--
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."organizations" ("id", "name") FROM stdin;
a31118a9-ab1e-4dc5-959e-99dd97aa8667	Default Organization
\.


--
-- Data for Name: questions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."questions" ("id", "slug", "title", "difficulty", "prompt", "sample_input_output", "tags", "created_at", "starter_code") FROM stdin;
6935992a-c389-4b09-866d-235925fc5c65	two-sum-indices	Two Sum Indices	Easy	Given an array of integers and a target value, return the indices of two distinct numbers that add up to the target. You may assume exactly one valid pair exists.	Input: nums = [2, 7, 11, 15], target = 9\nOutput: [0, 1]	hash-map,array	2026-05-22 14:25:23.66303+08	import sys\n\ndef solve(nums, target):\n    # Explain your approach before filling this in.\n    pass\n\ndef main():\n    data = sys.stdin.read().strip().split()\n    if not data:\n        return\n    target = int(data[-1])\n    nums = [int(x) for x in data[:-1]]\n    print(solve(nums, target))\n\nif __name__ == "__main__":\n    main()\n
2695c04c-91d0-41d5-a18d-38965d4d166b	valid-parentheses	Valid Parentheses	Easy	Given a string containing only brackets '(', ')', '{', '}', '[' and ']', determine whether the brackets are balanced and closed in the correct order.	Input: s = "([{}])"\nOutput: true	stack,string	2026-05-22 14:25:23.667969+08	import sys\n\ndef is_valid(s):\n    # Explain which structure tracks open brackets.\n    pass\n\ndef main():\n    s = sys.stdin.read().strip()\n    print(str(is_valid(s)).lower())\n\nif __name__ == "__main__":\n    main()\n
38dd15a1-3e7c-49c7-bc0d-fe2513ef0f54	merge-intervals	Merge Intervals	Medium	Given a list of intervals, merge all overlapping intervals and return a list of non-overlapping intervals sorted by start time.	Input: [[1,3],[2,6],[8,10],[15,18]]\nOutput: [[1,6],[8,10],[15,18]]	sorting,intervals	2026-05-22 14:25:23.668956+08	import ast\nimport sys\n\ndef merge(intervals):\n    # State how ordering helps before coding the merge.\n    pass\n\ndef main():\n    raw = sys.stdin.read().strip()\n    intervals = ast.literal_eval(raw) if raw else []\n    print(merge(intervals))\n\nif __name__ == "__main__":\n    main()\n
3b49c27d-9b99-43e9-8b64-5a53115b057e	first-non-repeating-character	First Non-Repeating Character	Easy	Given a lowercase string, return the index of the first character that appears exactly once. Return -1 if every character repeats.	Input: s = "leetcode"\nOutput: 0	hash-map,string	2026-05-22 14:25:23.669607+08	import sys\n\ndef first_unique_char(s):\n    # Explain how you will count and preserve order.\n    pass\n\ndef main():\n    s = sys.stdin.read().strip()\n    print(first_unique_char(s))\n\nif __name__ == "__main__":\n    main()\n
f344be10-4369-4764-8a2c-7c74d3ee7e93	top-k-frequent-elements	Top K Frequent Elements	Medium	Given an integer array and a number k, return the k most frequent elements. The answer may be returned in any order.	Input: nums = [1,1,1,2,2,3], k = 2\nOutput: [1,2]	heap,hash-map,bucket-sort	2026-05-22 14:25:23.670355+08	import sys\n\ndef top_k_frequent(nums, k):\n    # Explain how frequency and ranking will be represented.\n    pass\n\ndef main():\n    data = [int(x) for x in sys.stdin.read().strip().split()]\n    if not data:\n        return\n    k = data[-1]\n    nums = data[:-1]\n    print(top_k_frequent(nums, k))\n\nif __name__ == "__main__":\n    main()\n
c96050fd-feb3-4fc5-9492-bac00eefd165	minimum-window-substring-lite	Minimum Covering Window	Hard	Given two strings source and target, return the smallest substring of source that contains every character from target, including duplicates. Return an empty string if no such window exists.	Input: source = "ADOBECODEBANC", target = "ABC"\nOutput: "BANC"	sliding-window,hash-map,string	2026-05-22 14:25:23.670983+08	import sys\n\ndef min_window(source, target):\n    # Explain what the moving window must maintain.\n    pass\n\ndef main():\n    lines = [line.rstrip("\\n") for line in sys.stdin.readlines()]\n    source = lines[0] if lines else ""\n    target = lines[1] if len(lines) > 1 else ""\n    print(min_window(source, target))\n\nif __name__ == "__main__":\n    main()\n
\.


--
-- Data for Name: room_questions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."room_questions" ("room_id", "question_id", "order_index") FROM stdin;
\.


--
-- Data for Name: rooms; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."rooms" ("id", "org_id", "room_code", "title", "problem_statement", "sample_input_output", "max_tokens", "created_at", "invite_email", "duration_minutes") FROM stdin;
\.


--
-- Data for Name: session_question_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."session_question_codes" ("session_id", "question_id", "current_code", "updated_at") FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."sessions" ("id", "room_id", "candidate_email", "candidate_name", "current_code", "tokens_used", "token_limit_hit", "updated_at", "status", "started_at", "ended_at", "expires_at", "candidate_access_token_hash", "active_client_id", "client_lease_expires_at") FROM stdin;
\.


--
-- Data for Name: telemetry_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."telemetry_events" ("id", "session_id", "event_type", "metadata_json", "timestamp") FROM stdin;
\.


--
-- Name: ai_configuration ai_configuration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_configuration"
    ADD CONSTRAINT "ai_configuration_pkey" PRIMARY KEY ("id");


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");


--
-- Name: interview_reports interview_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."interview_reports"
    ADD CONSTRAINT "interview_reports_pkey" PRIMARY KEY ("id");


--
-- Name: interview_reports interview_reports_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."interview_reports"
    ADD CONSTRAINT "interview_reports_session_id_key" UNIQUE ("session_id");


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");


--
-- Name: room_questions room_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."room_questions"
    ADD CONSTRAINT "room_questions_pkey" PRIMARY KEY ("room_id", "question_id");


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");


--
-- Name: session_question_codes session_question_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."session_question_codes"
    ADD CONSTRAINT "session_question_codes_pkey" PRIMARY KEY ("session_id", "question_id");


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");


--
-- Name: telemetry_events telemetry_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."telemetry_events"
    ADD CONSTRAINT "telemetry_events_pkey" PRIMARY KEY ("id");


--
-- Name: ix_questions_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ix_questions_slug" ON "public"."questions" USING "btree" ("slug");


--
-- Name: ix_rooms_room_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ix_rooms_room_code" ON "public"."rooms" USING "btree" ("room_code");


--
-- Name: ix_telemetry_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_telemetry_events_event_type" ON "public"."telemetry_events" USING "btree" ("event_type");


--
-- Name: chat_messages chat_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;


--
-- Name: interview_reports interview_reports_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."interview_reports"
    ADD CONSTRAINT "interview_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;


--
-- Name: room_questions room_questions_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."room_questions"
    ADD CONSTRAINT "room_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;


--
-- Name: room_questions room_questions_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."room_questions"
    ADD CONSTRAINT "room_questions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


--
-- Name: rooms rooms_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;


--
-- Name: session_question_codes session_question_codes_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."session_question_codes"
    ADD CONSTRAINT "session_question_codes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;


--
-- Name: session_question_codes session_question_codes_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."session_question_codes"
    ADD CONSTRAINT "session_question_codes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;


--
-- Name: sessions sessions_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


--
-- Name: telemetry_events telemetry_events_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."telemetry_events"
    ADD CONSTRAINT "telemetry_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict lfWVqJcLYSMZWj1mc8pLNGV97Zj6a7y6aYDjkoydXN2EfXeVHiLJwt5Y8I6mNkt

