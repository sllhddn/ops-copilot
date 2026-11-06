# ops-copilot: How to use

## 1. Run it

### Option A: local, no database install (fastest)

Requires Node.js 20 or later.

```bash
cd api
npm install
npm run seed        # creates ./.pglite (embedded PostgreSQL + pgvector) with 6 runbooks and 4 incidents
npm run dev         # http://localhost:3000
```

In a second terminal:

```bash
cd web
npm install
npm run dev         # http://localhost:5173 (calls the API through the Vite proxy)
```

### Option B: Docker Compose with PostgreSQL 16

```bash
cp .env.example .env          # optional: put your ANTHROPIC_API_KEY here
docker compose up --build
```

Open http://localhost:8080. The `seed` service loads the demo data once the API has migrated the database.

### Use Claude instead of the offline model

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset | Unset or `offline` = built-in offline model |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | Any Messages API model name |
| `DATABASE_URL` | unset | Unset = embedded PGlite in `PGLITE_DIR` (default `./.pglite`) |
| `MIN_RETRIEVAL_SCORE` | `0.2` | Below this cosine similarity the app refuses instead of answering |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated list of allowed origins |
| `PORT` | `3000` | API port |

## 2. Ask the runbooks

In the UI, open **Ask the runbooks** and type a question, or call the API:

```bash
curl -s -X POST localhost:3000/api/ask -H 'Content-Type: application/json' \
  -d '{"question":"Inserts fail with ORA-00001 after a data migration, what do I do?"}'
```

The response has:

| Field | Meaning |
|---|---|
| `answer` | Text with `[n]` markers |
| `grounded` | `false` if the app refused (weak evidence, or the model's citations were invalid) |
| `citations` | The sources behind each `[n]`: title, section and excerpt |
| `retrieval` | Every chunk considered, with fused score and cosine similarity, for debugging |

Questions the runbooks do not cover return `"The sources do not cover this question."` and never reach the model.

## 3. Use the agent

Open **Agent** and try:

- `What is the status of INC-1044?` → calls `get_incident`
- `List open P1 incidents` → calls `list_open_incidents`
- `How do we renew TLS certificates?` → calls `search_runbooks`
- `Add a note to INC-1042: sequence resynced, monitoring` → queues `add_incident_note`

The last one appears under **Waiting for approval**. Enter your name as reviewer and press **Approve**; the note is
then saved to the incident with you as the author. **Reject** discards it.

API equivalent:

```bash
curl -s -X POST localhost:3000/api/agent/chat -H 'Content-Type: application/json' \
  -d '{"message":"Add a note to INC-1042: sequence resynced"}'
curl -s localhost:3000/api/actions?status=PENDING
curl -s -X POST localhost:3000/api/actions/1/approve -H 'Content-Type: application/json' -d '{"reviewer":"duty.engineer"}'
```

Pass earlier turns as `history` (`[{"role":"user","content":"..."}, ...]`, up to 20) to keep context.

## 4. Add your own runbooks

**Documents** tab → choose a `.md` file or paste Markdown → **Add document**. Or:

```bash
curl -s -X POST localhost:3000/api/documents -H 'Content-Type: application/json' \
  -d '{"title":"Log Rotation","content":"## Steps\n\nRotate application logs daily and keep 14 days."}'
```

Headings (`#` to `####`) become chunk boundaries, so well-structured runbooks retrieve best. Titles must be unique.
`DELETE /api/documents/{id}` removes a document and its chunks.

## 5. Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/ask` | Cited answer from the runbooks |
| POST | `/api/agent/chat` | Agent turn: reply, tool steps, new pending actions |
| GET | `/api/actions?status=PENDING` | Approval queue |
| POST | `/api/actions/{id}/approve` · `/reject` | Decide (body: `{"reviewer": "name"}`); 409 if already decided |
| GET, POST | `/api/documents` | List / add runbooks |
| GET, DELETE | `/api/documents/{id}` | One document |
| GET, POST | `/api/incidents` | List (filter `status`, `severity`) / create |
| GET | `/api/incidents/{ref}` | One incident with notes |
| GET | `/api/metrics/llm` | Calls, failures, tokens, average and p95 latency per purpose |
| GET | `/api/health` | `{"status":"UP"}` when the database answers |

Errors use NestJS's JSON shape with `statusCode` and `message`; validation errors list every field.

## 6. Tests and evals

```bash
cd api
npm test            # 30 tests: unit, HTTP, agent loop, guardrails, evals
npm run eval        # prints hit@1, hit@3, MRR, citation coverage, refusals; exits 1 below the bar
npm run typecheck

cd ../web
npm test            # component tests
npm run build
```

Run the evals against a real PostgreSQL: `DATABASE_URL=postgres://... npm run eval`.

To evaluate a change to chunking, embeddings or prompts, add questions to `api/src/evals/questions.json`
(`q` plus the title of the runbook that should answer it) and compare the numbers before and after.

## 7. Deploy to AWS

See [infra/aws/README.md](../infra/aws/README.md). It costs money while running; destroy it afterwards.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Every answer is "The sources do not cover this question." | No documents, or `MIN_RETRIEVAL_SCORE` too high | `npm run seed`, or lower the threshold |
| `extension "vector" is not available` | PostgreSQL without pgvector | Use the `pgvector/pgvector:pg16` image, or RDS PostgreSQL 15+ |
| 409 when adding a document | Title already exists | Delete the old one or choose another title |
| Agent says it stopped after the maximum number of steps | Model kept calling tools | Ask a narrower question |
| `401` or `authentication_error` in API logs | Wrong `ANTHROPIC_API_KEY` | Check the key, or unset it to go offline |
| UI shows network errors | API not running on :3000 | Start the API, or set `API_URL` for the Vite proxy |
