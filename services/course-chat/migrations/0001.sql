-- D1 / SQLite. Apply once; no credentials or course text are embedded here.
PRAGMA foreign_keys = ON;
CREATE TABLE course_versions (
  version TEXT PRIMARY KEY, course_id TEXT NOT NULL CHECK(course_id='ECE685'),
  vector_store_id TEXT NOT NULL, provider TEXT NOT NULL CHECK(provider IN ('openai','mock')), document_count INTEGER NOT NULL,
  selection_doc_id TEXT NOT NULL, manifest_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('staging','ready','paused')),
  created_at INTEGER NOT NULL
);
CREATE TABLE courses (course_id TEXT PRIMARY KEY, active_version TEXT REFERENCES course_versions(version));
INSERT INTO courses VALUES ('ECE685', NULL);
CREATE TABLE documents (
  version TEXT NOT NULL REFERENCES course_versions(version), doc_id TEXT NOT NULL,
  file_id TEXT NOT NULL, content_sha256 TEXT NOT NULL, text TEXT NOT NULL,
  metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
  PRIMARY KEY(version,doc_id), UNIQUE(version,file_id)
);
CREATE TABLE invitations (
  invite_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  max_messages INTEGER NOT NULL CHECK(max_messages>0), messages_used INTEGER NOT NULL DEFAULT 0,
  max_sessions INTEGER NOT NULL CHECK(max_sessions>0), sessions_used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, invite_hash TEXT NOT NULL REFERENCES invitations(invite_hash),
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  messages_used INTEGER NOT NULL DEFAULT 0, history_json TEXT NOT NULL DEFAULT '[]',
  history_version TEXT
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE daily_usage (day TEXT PRIMARY KEY, messages_used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE requests (
  session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  request_id TEXT NOT NULL, version TEXT NOT NULL REFERENCES course_versions(version),
  started_at INTEGER NOT NULL, lease_until INTEGER NOT NULL, day TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', error_code TEXT,
  input_tokens INTEGER, output_tokens INTEGER, duration_ms INTEGER,
  session_limit INTEGER NOT NULL, daily_limit INTEGER NOT NULL, concurrency_limit INTEGER NOT NULL,
  PRIMARY KEY(session_hash,request_id)
);
CREATE INDEX requests_leases ON requests(status,lease_until);
CREATE TABLE auth_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);

-- Quotas and reservations are ONE statement. Failed reservations change no counters.
-- Parenthesize CASE expressions so D1's remote statement splitter does not
-- mistake their END for the end of the trigger body.
CREATE TRIGGER session_guard BEFORE INSERT ON sessions BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM invitations WHERE invite_hash=NEW.invite_hash AND enabled=1
    AND expires_at>NEW.created_at
  ) THEN RAISE(ABORT,'invite_invalid') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM invitations WHERE invite_hash=NEW.invite_hash
    AND (sessions_used>=max_sessions OR messages_used>=max_messages)
  ) THEN RAISE(ABORT,'quota_exceeded') END);
END;
CREATE TRIGGER session_count AFTER INSERT ON sessions BEGIN
  UPDATE invitations SET sessions_used=sessions_used+1 WHERE invite_hash=NEW.invite_hash;
END;
CREATE TRIGGER request_guard BEFORE INSERT ON requests BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM requests WHERE session_hash=NEW.session_hash AND request_id=NEW.request_id
  ) THEN RAISE(ABORT,'duplicate_request') END);
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM sessions s JOIN invitations i USING(invite_hash)
    WHERE s.token_hash=NEW.session_hash AND s.expires_at>NEW.started_at
    AND i.enabled=1 AND i.expires_at>NEW.started_at
  ) THEN RAISE(ABORT,'unauthorized') END);
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM courses c JOIN course_versions v ON v.version=c.active_version
    WHERE c.course_id='ECE685' AND v.version=NEW.version AND v.status='ready'
  ) THEN RAISE(ABORT,'service_unavailable') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM requests WHERE session_hash=NEW.session_hash AND status='running'
    AND lease_until>NEW.started_at
  ) THEN RAISE(ABORT,'rate_limited') END);
  SELECT (CASE WHEN (SELECT COUNT(*) FROM requests WHERE status='running' AND lease_until>NEW.started_at)
    >=NEW.concurrency_limit THEN RAISE(ABORT,'rate_limited') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM sessions s JOIN invitations i USING(invite_hash) WHERE s.token_hash=NEW.session_hash
    AND (s.messages_used>=NEW.session_limit OR i.messages_used>=i.max_messages)
  ) OR COALESCE((SELECT messages_used FROM daily_usage WHERE day=NEW.day),0)>=NEW.daily_limit
    THEN RAISE(ABORT,'quota_exceeded') END);
END;
CREATE TRIGGER request_count AFTER INSERT ON requests BEGIN
  UPDATE sessions SET messages_used=messages_used+1 WHERE token_hash=NEW.session_hash;
  UPDATE invitations SET messages_used=messages_used+1
    WHERE invite_hash=(SELECT invite_hash FROM sessions WHERE token_hash=NEW.session_hash);
  INSERT INTO daily_usage VALUES(NEW.day,1)
    ON CONFLICT(day) DO UPDATE SET messages_used=messages_used+1;
END;

-- A staging version cannot become active just because a partial import exists.
CREATE TRIGGER activate_guard BEFORE UPDATE OF active_version ON courses
WHEN NEW.active_version IS NOT NULL BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM course_versions v WHERE v.version=NEW.active_version AND v.status='ready'
    AND v.course_id=NEW.course_id
    AND v.document_count=(SELECT COUNT(*) FROM documents d WHERE d.version=v.version)
    AND EXISTS (SELECT 1 FROM documents d WHERE d.version=v.version AND d.doc_id=v.selection_doc_id
      AND json_extract(d.metadata_json,'$.source_type')='course_material_selection'
      AND json_extract(d.metadata_json,'$.edition')=6)
  ) THEN RAISE(ABORT,'version_not_ready') END);
END;
