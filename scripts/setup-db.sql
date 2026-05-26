-- Run as a PostgreSQL superuser, e.g.:
--   psql -U postgres -f scripts/setup-db.sql

CREATE USER interview WITH PASSWORD 'interview';
CREATE DATABASE interview_platform OWNER interview;
GRANT ALL PRIVILEGES ON DATABASE interview_platform TO interview;
