-- ops-copilot schema v1
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id          bigserial PRIMARY KEY,
  title       varchar(200) NOT NULL,
  source      varchar(300),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uk_documents_title UNIQUE (title)
);

-- One row per chunk. tsv powers keyword search, embedding powers semantic search.
CREATE TABLE chunks (
  id           bigserial PRIMARY KEY,
  document_id  bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal      int NOT NULL,
  heading      varchar(300),
  content      text NOT NULL,
  tsv          tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading, '') || ' ' || content)) STORED,
  embedding    vector(256) NOT NULL,
  CONSTRAINT uk_chunks_doc_ordinal UNIQUE (document_id, ordinal)
);
CREATE INDEX ix_chunks_tsv ON chunks USING gin (tsv);
CREATE INDEX ix_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE incidents (
  id           bigserial PRIMARY KEY,
  ref          varchar(20) NOT NULL,
  title        varchar(200) NOT NULL,
  service      varchar(100) NOT NULL,
  severity     varchar(2) NOT NULL,
  status       varchar(20) NOT NULL DEFAULT 'OPEN',
  opened_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  summary      text,
  CONSTRAINT uk_incidents_ref UNIQUE (ref),
  CONSTRAINT ck_incidents_severity CHECK (severity IN ('P1', 'P2', 'P3', 'P4')),
  CONSTRAINT ck_incidents_status CHECK (status IN ('OPEN', 'MITIGATED', 'RESOLVED'))
);
CREATE INDEX ix_incidents_status ON incidents (status, severity);

CREATE TABLE incident_notes (
  id           bigserial PRIMARY KEY,
  incident_id  bigint NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  body         varchar(2000) NOT NULL,
  author       varchar(100) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Writes the agent wants to make wait here until a person approves them.
CREATE TABLE pending_actions (
  id          bigserial PRIMARY KEY,
  tool        varchar(50) NOT NULL,
  args        jsonb NOT NULL,
  reason      varchar(500),
  status      varchar(10) NOT NULL DEFAULT 'PENDING',
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz,
  decided_by  varchar(100),
  result      text,
  CONSTRAINT ck_pending_actions_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

-- Every model call is recorded: cost, speed and what it was for.
CREATE TABLE llm_calls (
  id             bigserial PRIMARY KEY,
  purpose        varchar(20) NOT NULL,
  model          varchar(100) NOT NULL,
  input_tokens   int NOT NULL DEFAULT 0,
  output_tokens  int NOT NULL DEFAULT 0,
  latency_ms     int NOT NULL,
  ok             boolean NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
