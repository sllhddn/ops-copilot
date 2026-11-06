# Changelog

## 1.0.0 – 2026-11-05

- RAG over Markdown runbooks: heading-aware chunking, pgvector + full-text hybrid search with Reciprocal Rank Fusion, cited answers, refusal when evidence is weak.
- Tool-calling agent (Claude) with four tools, input validation, five-round limit and human approval for writes.
- Pending action queue with approve/reject and single-decision guarantee.
- Model call audit log and `/api/metrics/llm`.
- Offline model and hashing embedder so the app and tests run without keys or downloads.
- Retrieval and answer evals in CI.
- React UI, Docker Compose stack, Terraform for AWS ECS Fargate + RDS, GitHub Actions CI.
