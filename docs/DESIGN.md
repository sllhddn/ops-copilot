# ops-copilot: Design document

| | |
|---|---|
| Author | Sallehuddin Mohd Zakinuddin |
| Status | v1.0.0 |
| Last updated | November 2026 |

## 1. Context

Application support teams keep their knowledge in runbooks and SOPs, and their live state in incident records.
During an incident, engineers search both under pressure. A general chatbot is risky here: it can invent commands
or procedures that sound right. This project builds an assistant that answers only from the team's own documents,
shows its sources, and can act on incidents only with a person's approval. All runbooks and incidents in the
repository are fictional.

## 2. Goals and non-goals

**Goals**

1. Cited answers from Markdown runbooks, and an explicit refusal when the runbooks do not cover the question.
2. An agent that uses tools to read incidents and runbooks, and proposes writes for human approval.
3. Guardrails that are enforced in code and covered by tests, not only written in a prompt.
4. Measurable quality (evals) and visible cost (token and latency log).
5. Runs with no API key, no model download and no database install, so anyone can try it in two commands.
6. A deployment path to AWS described as code.

**Non-goals (this version)**

- Authentication and per-user permissions.
- PDF/Word ingestion; streaming responses.
- Fine-tuning or self-hosted models.

## 3. Architecture

```mermaid
flowchart LR
    U[React UI] -->|/api| N[nginx]
    N --> API["NestJS API"]
    API --> ASK["AskService<br/>RAG + guardrails"]
    API --> AG["AgentService<br/>tool loop, max 5 rounds"]
    ASK --> RET["Retriever<br/>hybrid search + RRF"]
    AG --> TOOLS["ToolRunner<br/>validated tools"]
    TOOLS --> RET
    TOOLS --> INC[IncidentsService]
    AG -->|write tools| ACT["ActionsService<br/>pending approval"]
    ASK --> LLM["AuditedLlm"]
    AG --> LLM
    LLM --> CL["Claude<br/>Messages API"]
    LLM -.->|no key| OFF[OfflineLlm]
    RET --> PG[("PostgreSQL 16<br/>pgvector + tsvector")]
    INC --> PG
    ACT --> PG
    LLM -->|every call| PG
```

| Component | Responsibility |
|---|---|
| `DocumentsService` | Chunk Markdown by heading, embed, store chunks and vectors |
| `Retriever` | Run vector and keyword search, fuse with RRF, return similarity for the confidence check |
| `AskService` | Refuse on weak evidence, build the cited prompt, validate citations |
| `AgentService` | Bounded tool loop; routes write tools to the approval queue |
| `ToolRunner` | Validates arguments against each tool's JSON schema, then runs the tool |
| `ActionsService` | Pending writes; one decision per action; runs the write on approval |
| `AuditedLlm` | Wraps any model client; records purpose, model, tokens, latency, success |

Every external dependency (database, model, embedder) is injected through `AppModule.register()`, so tests swap
them without mocking frameworks.

## 4. Data model

```mermaid
erDiagram
    DOCUMENTS ||--o{ CHUNKS : "split into"
    INCIDENTS ||--o{ INCIDENT_NOTES : "has"
    DOCUMENTS { bigint id PK
        varchar title UK
        varchar source }
    CHUNKS { bigint id PK
        bigint document_id FK
        int ordinal
        varchar heading
        text content
        tsvector tsv "generated, GIN index"
        vector embedding "256 dims, HNSW index" }
    INCIDENTS { bigint id PK
        varchar ref UK
        varchar severity "P1-P4"
        varchar status "OPEN, MITIGATED, RESOLVED" }
    INCIDENT_NOTES { bigint id PK
        bigint incident_id FK
        varchar body
        varchar author }
    PENDING_ACTIONS { bigint id PK
        varchar tool
        jsonb args
        varchar status "PENDING, APPROVED, REJECTED"
        varchar decided_by }
    LLM_CALLS { bigint id PK
        varchar purpose
        int input_tokens
        int output_tokens
        int latency_ms
        boolean ok }
```

The schema is created by versioned SQL files (`api/src/db/migrations/001_init.sql`) applied once each and
recorded in `schema_migrations`, the same idea as Flyway.

## 5. Request flows

### Ask

```mermaid
sequenceDiagram
    participant U as User
    participant A as AskService
    participant R as Retriever
    participant DB as PostgreSQL
    participant M as Model
    U->>A: question
    A->>R: search(question, k=5)
    R->>DB: vector top-20 (cosine)
    R->>DB: full-text top-20 (ts_rank_cd)
    R-->>A: fused top-5 + similarity
    alt best similarity < 0.2
        A-->>U: refusal (model not called)
    else
        A->>M: system rules + numbered sources + question
        M-->>A: answer with [n]
        A->>A: keep only [n] that match sent sources
        A-->>U: answer, citations, retrieval details
    end
```

### Agent with approval

```mermaid
sequenceDiagram
    participant U as User
    participant G as AgentService
    participant M as Model
    participant T as ToolRunner
    participant Q as Approval queue
    U->>G: "Add a note to INC-1042: ..."
    G->>M: messages + tool definitions
    M-->>G: tool_use add_incident_note
    G->>G: validate arguments
    G->>Q: insert PENDING action
    G->>M: tool_result {queued: true}
    M-->>G: "Queued for approval"
    G-->>U: reply + pending action
    U->>Q: approve (reviewer)
    Q->>T: run add_incident_note as reviewer
```

## 6. Key decisions

| # | Decision | Alternatives | Reason |
|---|---|---|---|
| 1 | PostgreSQL + pgvector | Pinecone, Chroma, FAISS | One database for documents, vectors, incidents and audit; transactions and SQL; available on RDS |
| 2 | Hybrid search (vector + full-text) fused with RRF | Vector only | Runbooks are full of exact tokens (error codes, command names) that keyword search finds and embeddings blur; RRF needs no score calibration between the two |
| 3 | Chunk by Markdown heading, ~900 chars, one-paragraph overlap | Fixed-size windows | Each chunk keeps its section's meaning, and the heading is shown as the citation's location |
| 4 | Refuse below a similarity threshold before calling the model | Let the model decide | Cheaper and more reliable; the refusal path is testable without a model |
| 5 | Validate citations after generation | Trust the model | A citation to a source that was never sent is a hallucination signal; the answer is downgraded to a refusal |
| 6 | Write tools go to an approval queue | Let the agent write | Incident records are shared, audited data. A person decides; the approver becomes the author |
| 7 | Validate tool arguments against the JSON schema | Trust model output | Model output is untrusted input; a malformed reference is returned to the model as an error instead of reaching SQL |
| 8 | Bounded loop (5 rounds) and history (last 10 turns) | Unbounded | Caps cost and latency; prevents tool-call loops |
| 9 | Retrieved text wrapped in `<source>` tags and declared "data, not instructions" | No marking | Reduces prompt injection from documents; combined with decisions 5–7 so the defence does not rely on the prompt alone |
| 10 | Offline model and hashing embedder built in | Require API keys | Anyone can run and test the project; CI needs no secrets; the interfaces make swapping in hosted models one class |
| 11 | Every model call logged with tokens and latency | Provider dashboard only | Cost and speed per feature are visible in the app and queryable with SQL |
| 12 | Conditional `UPDATE … WHERE status = 'PENDING'` for decisions | Read then write | Two reviewers clicking at once cannot both approve |

## 7. Evaluation

`npm run eval` loads the seed runbooks and runs a fixed question set:

| Metric | Meaning | Current (built-in embedder) |
|---|---|---|
| hit@1 / hit@3 | Right runbook ranked first / in the top three | 1.00 / 1.00 |
| MRR | Mean reciprocal rank of the right runbook | 1.00 |
| Citation coverage | In-scope answers that carry valid citations | 12 / 12 |
| Refusals | Out-of-scope questions correctly refused | 3 / 3 |

CI fails if hit@3 drops below 0.8, MRR below 0.7, or any refusal is missed.

**What these numbers do not show.** The question set is small and its wording overlaps with the runbooks, which
suits a word-based embedder. Paraphrased questions ("the box ran out of RAM") would score lower; a hosted
embedding model would fix that, and the eval set is the tool to prove it. Answer correctness beyond "is it cited"
is not scored automatically; with a real model, the next step is a graded set reviewed by the team.

## 8. Deployment

```mermaid
flowchart LR
    I((Internet)) --> ALB[Application Load Balancer :80]
    ALB --> T
    subgraph T[ECS Fargate task]
        W[web: nginx] -->|localhost:3000| A[api: NestJS]
    end
    A --> RDS[(RDS PostgreSQL 16<br/>pgvector)]
    A --> SM[Secrets Manager<br/>DATABASE_URL, ANTHROPIC_API_KEY]
    A --> CW[CloudWatch Logs]
    A --> C[Anthropic API]
```

- One task, two containers: nginx serves the React build and proxies `/api` over localhost.
- Secrets are injected by ECS from Secrets Manager; the Anthropic key is set by hand so it never enters Terraform state.
- The database only accepts connections from the task's security group; the task only from the load balancer.
- Deployment circuit breaker rolls back a failing release automatically.
- Demo shortcuts, listed so nobody mistakes them for production: default VPC with public IPs, HTTP without TLS,
  single task, `skip_final_snapshot`. Production would add private subnets with NAT, an ACM certificate,
  two or more tasks across zones, and backups retained.

## 9. Testing

| Level | Tests | What they prove |
|---|---|---|
| Unit | chunker, embedder, tool validation, migration splitter, config | Building blocks behave, including edge cases |
| HTTP | documents, ask, incidents, metrics | Validation, 404/409, refusal without a model call, citations |
| Agent (offline model) | read tool, queued write, approve, double decision | End-to-end approval flow |
| Agent (scripted model) | bad tool input, step limit, invalid citations, source marking, model failure logged | Guardrails hold whatever the model returns |
| Evals | retrieval and answer quality | Quality does not regress |
| Web | answer rendering, approval card, ask page | UI calls the API correctly and shows errors |
| CI | the above, plus PostgreSQL 16 + pgvector job, Docker builds, `terraform validate` | Same code on the real database engine |

Tests run on embedded PostgreSQL (PGlite with pgvector), so they need no Docker; the CI job repeats migrations,
seed and evals on the official pgvector image.

## 10. Security

- Parameterised SQL everywhere; tool arguments validated before use.
- Request bodies validated with class-validator; unknown fields rejected.
- No secrets in the repository or Terraform state; containers run as non-root.
- The model cannot write without a named human approver.
- Not done yet: authentication. Do not expose this build publicly without it.

## 11. Limitations and future work

1. Authentication (OIDC) and per-role permissions for approvals.
2. Hosted embedding model behind the `Embedder` interface, with a paraphrase eval set.
3. Streaming answers to the UI.
4. More tools (open incident, link runbook to incident), each with its own approval rule.
5. Re-ranking step for the top passages.
