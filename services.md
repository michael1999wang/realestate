# Core Services (MVP → v1)

## 1. Ingestor (TRREB/CREA)

- **Role**: Poll delta updates, normalize listings, upsert to DB, publish listing_changed
- **Inputs**: RESO/DDF feed (dev: mock/fixtures)
- **Outputs/Events**: `listing_changed {listingId, updatedAt, dirty[]}`
- **Storage**: listings, sync_state
- **Notes**: Implements SourcePort, RepoPort, BusPort

## 2. Enrichment

- **Role**: Add taxes, fees, Walk/Transit Score, CMHC rent priors, geocoding
- **Inputs**: `listing_changed`
- **Outputs/Events**: Writes enrichments; may emit `underwrite_requested`
- **Storage**: enrichments (JSON per listing + versions)
- **External**: Walk Score, Local Logic, municipal tax tables, BoC rates

## 3. Rent Estimator

- **Role**: Estimate market rent (comps or model)
- **Inputs**: `listing_changed` (or from Enrichment)
- **Outputs/Events**: Writes rent_estimates; may emit `underwrite_requested`
- **Storage**: rental_comps, rent_estimates
- **External**: Rental data partners (later), CMHC priors (now)

## 4. Underwriting

- **Role**: Compute NOI, DSCR, CoC, cashflow, IRR
- **Inputs**: `underwrite_requested {listingId, assumptionsId?}`
- **Outputs/Events**: `underwrite_completed {listingId, resultId, score}`
- **Storage**: listing_base (price, NOI_x, closing), mortgage_factors, underwrite_grid (shared bins), calc_cache (exact)
- **Notes**: Vectorized grid + exact cache (from previous message)

## 5. Alerts

- **Role**: Match `underwrite_completed` to users' saved searches & thresholds; send notifications
- **Inputs**: `underwrite_completed`
- **Outputs/Events**: `alert_fired` + sends email/SMS/Slack/web-push
- **Storage**: saved_searches, assumption_sets, alerts

## 6. API Gateway / BFF

- **Role**: Public API for UI and integrations
- **Endpoints**:
  - `/properties/search`
  - `/properties/{id}`
  - `/underwrite`
  - `/assumptions`
  - `/saved-searches`
  - `/alerts`
- **Auth**: Clerk/Auth0; rate limits per plan
- **Notes**: Reads from OLTP + search index

## 7. Web App (Dashboard)

- **Role**: Next.js app for search, detail view, sensitivity sliders, saved searches, alerts
- **Consumes**: API Gateway

## 8. Notifications

- **Role**: Email/SMS/Slack/web-push delivery; templates & retries
- **Inputs**: `alert_fired`, system messages
- **External**: SendGrid/SES, Twilio, Slack webhooks
- **Storage**: notification_logs, bounce/suppression lists

---

# Advanced / Nice-to-Have Services

## 9. Vision (Reno AI)

- **Role**: Analyze photos → room types, condition, features; propose renos; cost ranges; ARV uplift
- **Inputs**: `listing_changed` (on media present)
- **Outputs**: image_analysis, reno_suggestions
- **External**: Multimodal LLM or small vision models
- **Notes**: Versioned outputs; per-image hashing + caching

## 10. Search & Index

- **Role**: Fast text/geo queries over listings + facets (city, beds, price)
- **Backend**: Postgres+PGVector/Trigram or OpenSearch/Meilisearch
- **Updates**: Subscribed to `listing_changed` to reindex

## 11. Billing & Plans

- **Role**: Stripe integration, usage metering (underwrites/day, saved searches, alerts)
- **Storage**: subscriptions, usage_counters, invoices
- **Hooks**: Webhooks → upgrade/downgrade entitlements

## 12. Admin / Ops

- **Role**: Back-office: data QA, replay jobs, kill/redo underwrites, view metrics
- **Auth**: Owner-only

## 13. Model Training (offline)

- **Role**: Train/refresh rent model, hedonic uplift model, vision heads
- **IO**: Reads warehouse (Parquet), writes model_registry + versioned weights

## 14. Reporting & Exports

- **Role**: Generate PDF/CSV pro-formas; bulk exports for Pro/Enterprise
- **Inputs**: API requests or scheduled jobs

---

# Event Topics (Minimum)

```json
{
  "listing_changed": {"id", "updatedAt", "dirty[]"},
  "underwrite_requested": {"id", "assumptionsId?"},
  "underwrite_completed": {"id", "resultId", "score"},
  "alert_fired": {"userId", "listingId", "resultId", "channel"}
}
```

---

# Datastores

- **OLTP**: Postgres (+ PostGIS later)
- **Cache/Queue**: Redis (jobs, debounce), plus SQS/Kafka/Rabbit for durable queues
- **Search**: Meilisearch/OpenSearch (or Postgres GIN + PGTrgm)
- **Warehouse** (optional): DuckDB/Parquet or BigQuery for training & analytics
- **Object storage**: S3-compatible for images/exports

---

# Minimal Deployment Slices

## MVP Slice (Week 1–2)

- Ingestor (Mock/Fixtures)
- Enrichment (light) + Rent Estimator (priors)
- Underwriting (grid + exact cache)
- Alerts (email only)
- API Gateway + Web App (search/detail, save 1–2 searches)

## v1 Slice (Month 1)

- Swap Ingestor to DDF adapter
- Add Notifications service (email/SMS/Slack)
- Add Search index
- Billing & Plans (Starter/Pro)
- Vision (basic LLM pass for top-5 photos)

---

# Service Boundaries & Interfaces (Quick Contracts)

- **Ingestor → Bus**: publishes `listing_changed`
- **Enrichment/Rent → Repo**: write enrichments, rent_estimates
- **Alerts → Notifications**: `sendEmail|sendSMS|sendSlack(payload)` with idempotency key
- **API → Services**: thin orchestration; no business logic—pulls latest underwrite_grid or computes exact on-demand and caches

---

# Team Scaling (Later)

Split along data lifecycle:

- **Ingestion**: Ingestor, data pipelines
- **Intelligence**: Enrich/rent/vision services
- **Underwriting**: Core calculation engine
- **Growth**: Alerts/billing/user management
- **Frontend**: Web + BFF
- **Platform**: Infra, queues, observability

---

# Observability

- **Centralized logs**: Pino → Loki
- **Metrics**: Prometheus
- **Traces**: OTel/Tempo
- **SLOs**:
  - Ingest freshness
  - Underwrite latency P95
  - Alert delivery success
