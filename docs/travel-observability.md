# Trusted travel and itinerary observability

Roamly writes one-line JSON events named `roamly_operation` to standard output. Events contain only operation names, a request correlation ID, latency, outcome, HTTP status, deployment region, cache status, a bounded error code, and cold/warm runtime state. Do not add user IDs, trip IDs, candidate IDs, emails, prompts, offer IDs, tokens, or request/response payloads.

## Latency alerts

Alert on p95 over a rolling 10-minute window with at least 20 requests. Warn for two consecutive windows and mark critical for two consecutive windows.

| Operation | Warning | Critical |
| --- | ---: | ---: |
| `travel_selection_get` | 2 s | 5 s |
| `travel_selection_put` | 3 s | 6 s |
| `travel_planning_preview_get` | 4 s | 8 s |
| `gemini_invocation` | 15 s | 30 s |

## Error-rate alerts

Use a 10-minute rolling window and exclude expected `409` conflicts from the general failure rate.

| Signal | Warning | Critical |
| --- | ---: | ---: |
| Authentication failures | 3% | 8% |
| Unexpected HTTP 500 responses | 1% | 3% |
| AI quota/rate-limit fallback | 5% | 15% |
| Destination retrieval failures | 2% | 5% |
| Concurrency conflicts | report separately at 5%; investigate at 15% |

## Vercel setup

Vercel Functions already capture `console.info` JSONL. For the no-cost baseline, use Runtime Logs filters for `"event":"roamly_operation"`, operation, status, errorCode, region, and runtimeState. Configure alerts in the connected log provider if a log drain is already available; otherwise use Vercel log search during incidents and export JSONL for a release review. Never enable full request-body logging.

Run a local or exported-log summary with:

```powershell
npm run observability:travel-summary -- --input=travel-production.jsonl
```

The report includes request, success, failure and fallback counts; median, p95 and max latency; cache-hit rate; and totals by error code and region.
