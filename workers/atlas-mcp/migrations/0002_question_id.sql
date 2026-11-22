-- Ryan, 2026-11-22 ("1"): every tool asks for a question ID the assistant makes up and sends on every call made for one
-- question, so the usage page can count questions as well as calls. Missing on calls logged before it, or when an
-- assistant leaves it out.
ALTER TABLE calls ADD COLUMN question_id TEXT;
CREATE INDEX calls_tester_question ON calls (tester, question_id);
