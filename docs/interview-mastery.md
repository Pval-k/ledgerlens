# LedgerLens Interview Mastery Guide

This guide is the final layer on top of the section docs.  
Its goal is not just understanding, but **interview performance under pressure**.

Use this after reading `docs/interview-prep.md`.

---

## 1) Reality check: what "100% ready" means

No one can guarantee "any possible question."  
But you can reach a practical 100% state for this project by being strong in these 5 areas:

1. **System story**: explain what LedgerLens does end-to-end in under 60 seconds.
2. **Code mapping**: point to where each behavior lives (auth, upload, worker, analytics).
3. **Tradeoffs**: explain why this architecture was chosen and what alternatives exist.
4. **Failure handling**: explain what breaks, how you detect it, and how you recover.
5. **Evidence**: reference concrete implementation details (endpoints, models, flows, constraints).

If you can do those 5, interviewers usually consider you highly prepared.

---

## 2) Your 60-second project pitch (memorize this)

"LedgerLens is a multi-tenant financial document intelligence system.  
Users authenticate with JWT + refresh sessions, upload CSV statements via presigned S3-compatible URLs, and the API queues ingestion jobs to a BullMQ worker.  
The worker parses and normalizes transactions, writes them to Postgres, and precomputes monthly/category summary tables.  
The API serves user-scoped analytics from those summary tables for fast dashboard reads, with reliability features like idempotency keys, rate limiting, health endpoints, and structured logging."

Practice saying this naturally, not like a script.

---

## 3) Must-know answers (if you only memorize 15)

1. **Why API + worker split?**  
   To keep API latency low and move heavy CSV processing to async jobs.
2. **What does "multi-tenant" mean here?**  
   One system serves many users; all document/analytics access is scoped by `userId`.
3. **What are protected endpoints?**  
   Routes guarded by JWT auth; require bearer token.
4. **Why refresh tokens?**  
   Short-lived access tokens + revocable sessions improve security.
5. **What is ORM?**  
   A typed layer mapping app code to relational DB operations (Prisma over Postgres).
6. **`schema.prisma` vs `migration.sql`?**  
   Schema defines target model; migration SQL defines incremental structure changes.
7. **Where is actual data stored?**  
   In running PostgreSQL instance, not in migration files.
8. **What does worker normalization do?**  
   Maps varied CSV headers into consistent transaction fields.
9. **Required CSV columns?**  
   Date + amount (with aliases). Category optional. Currency defaults to USD.
10. **How are analytics fast?**  
    Worker materializes summary tables; API reads pre-aggregated data.
11. **What is idempotency here?**  
    Same key + same fingerprint replays response; mismatched payload conflicts.
12. **How are retries handled safely?**  
    Idempotent write endpoints + deterministic worker rebuild behavior.
13. **How do you detect system health?**  
    Live/ready/metrics endpoints + worker metrics logs.
14. **How do you prevent cross-user leaks?**  
    Ownership checks by `userId`; unauthorized resource reads return not found.
15. **What happens on ingest failure?**  
    Document status becomes failed and stores `ingestError`.

---

## 4) Architecture tradeoffs you should be ready to discuss

### Why presigned URLs instead of API file upload proxy?

- Pro: less API bandwidth, better scaling, cleaner separation.
- Con: slightly more moving parts and coordination.

### Why materialized summaries instead of live aggregation?

- Pro: fast and predictable reads for charts.
- Con: more complexity in ingestion pipeline and consistency handling.

### Why JWT + refresh sessions?

- Pro: scalable stateless access tokens plus revocable long-lived sessions.
- Con: token lifecycle logic is more complex than basic login-only auth.

### Why Redis/BullMQ?

- Pro: robust async job model, retries, queue metrics.
- Con: extra infrastructure to operate.

---

## 5) Failure-mode stories (interviewers love these)

Prepare short STAR-style stories (Situation, Task, Action, Result):

1. **Schema mismatch / missing migration**
   - Symptom: runtime errors after deploy or startup.
   - Action: run migration deploy, add clearer DB exception handling.
   - Result: reproducible startup and better error clarity.

2. **CSV parse failure**
   - Symptom: ingest job fails for malformed date/amount.
   - Action: strict row parsing + explicit error capture.
   - Result: document marked failed with human-readable `ingestError`.

3. **Duplicate client retries**
   - Symptom: duplicate writes from network retries.
   - Action: idempotency key + request fingerprint replay/conflict logic.
   - Result: retry-safe write behavior.

4. **Cross-user data access risk**
   - Symptom: potential unauthorized document reads.
   - Action: enforce `userId` scoping and test with e2e isolation scenarios.
   - Result: safe tenant boundaries.

---

## 6) Rapid-fire mock interview (self-test)

Answer each in 20-40 seconds:

- What happens after `POST /documents/:id/complete-upload`?
- Why do you need both `Transaction` and summary tables?
- What is the difference between authentication and authorization?
- If Redis is down, what user-facing behavior changes?
- Why is idempotency mostly applied to write endpoints?
- Why can category be optional but date/amount cannot?
- How would you support very large CSV files safely?
- Why do health endpoints include both live and ready?
- What would you index first for analytics performance?
- How would you add anomaly detection next?

If you cannot answer quickly, revisit linked section docs.

---

## 7) Hands-on readiness checklist (must be all YES)

Mark yourself only when you can do it without reading notes:

- [ ] Explain architecture in 60 seconds.
- [ ] Draw data flow from upload to analytics on a whiteboard.
- [ ] Explain JWT + refresh + logout-all mechanics.
- [ ] Explain how user isolation is enforced in code and query layer.
- [ ] Explain ORM, schema, migration, and where real data lives.
- [ ] Explain worker parse/normalize/aggregate pipeline.
- [ ] Describe at least 3 failure modes and mitigations.
- [ ] List major endpoints by domain (auth/documents/analytics/health).
- [ ] Explain idempotency behavior and why it matters in production.
- [ ] Explain why the current design is good and where it can improve.

If even one item is "no," keep drilling that area.

---

## 8) 4-day final prep plan

### Day 1: Architecture + backend basics

- Read sections 1-6 from interview-prep hub.
- Practice 60-second pitch 10 times.
- Explain schema vs migration vs database out loud.

### Day 2: Flow + API + CSV behavior

- Read sections 7, 13, 14.
- Trace one full request from frontend action to DB row.
- Practice protected/public endpoint explanations.

### Day 3: Security + reliability

- Read sections 8, 9, 10.
- Prepare two tradeoff explanations and two failure stories.
- Practice "why this design?" answers.

### Day 4: Mock interview simulation

- Run rapid-fire question set twice.
- Do one 20-minute mock session recorded on video.
- Fix weak answers and rerun.

---

## 9) What to do right before the interview

- Review 60-second pitch.
- Review 15 must-know answers.
- Review endpoint groups and main data models.
- Review one concrete bug/fix story you personally understand.

Confidence comes from repetition + concrete examples, not from rereading docs passively.

---

## 10) Related docs

- Start here: [`docs/interview-prep.md`](./interview-prep.md)
- Endpoint details: [`docs/interview-13-api-endpoints.md`](./interview-13-api-endpoints.md)
- CSV details: [`docs/interview-14-csv-formats.md`](./interview-14-csv-formats.md)
- Progress timeline: [`docs/progress.md`](./progress.md)
