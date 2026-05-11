# Async PDF Processing Pipeline — Design Spec
**Date:** 2026-05-11
**Status:** Approved

## Overview

Refactor the synchronous `POST /extract` endpoint into an async job-based pipeline. Large PDFs can take several minutes to process; the current design blocks the HTTP connection until Marker and Groq finish. The new design enqueues the job immediately, returns a `job_id`, and lets the client poll for completion.

**Stack additions:** Celery (distributed task queue) + SQLite (broker + result backend, no external services required).

---

## Architecture

```
Mobile                        FastAPI                       Celery Worker
  │                              │                               │
  │── POST /extract ────────────>│                               │
  │                              │── enqueue task ──────────────>│
  │<── {job_id, status:"queued"} │                               │
  │                              │                    Marker + Groq running
  │── GET /jobs/{job_id} ───────>│                               │
  │<── {status: "processing"}    │                               │
  │                              │                               │
  │── GET /jobs/{job_id} ───────>│                               │
  │<── {status:"success", ...}   │<── write result ──────────────│
```

Celery uses SQLite as both broker (`sqla+sqlite:///data/celery.db`) and result backend (`db+sqlite:///data/results.db`). No Redis or RabbitMQ required — suitable for a single-user local dev service.

---

## File Structure

```
backend/
├── main.py                    # FastAPI app + routes only
├── models.py                  # Pydantic models — API contract
│
├── pipeline/                  # Core extraction logic
│   ├── __init__.py
│   ├── extractor.py           # Marker integration
│   └── verifier.py            # Groq batch scoring
│
├── queue/                     # Async job infrastructure
│   ├── __init__.py
│   ├── celery_app.py          # Celery instance + broker/backend config
│   ├── tasks.py               # process_pdf Celery task
│   └── store.py               # Job status queries over result backend
│
├── data/                      # Runtime-generated, gitignored
│   ├── celery.db              # Celery broker queue
│   └── results.db             # Celery result backend
│
├── uploads/                   # Uploaded PDFs awaiting processing, gitignored
│
├── requirements.txt
└── tests/
    ├── conftest.py
    ├── pipeline/
    │   ├── test_extractor.py
    │   └── test_verifier.py
    ├── queue/
    │   └── test_tasks.py
    └── test_main.py
```

`data/` and `uploads/` are added to `.gitignore`.

---

## API Contract

### `POST /extract`

Validates the file and enqueues a processing job.

**Request:** `multipart/form-data`, field `pdf_file` (binary)

**Response 200:**
```json
{ "job_id": "uuid", "status": "queued" }
```

**Error responses:**
- `413` — file exceeds `MAX_PDF_SIZE_MB` (default 100, env-configurable)
- `422` — file is empty, magic bytes are not `%PDF`, or request is malformed
- `500` — disk full or unexpected error saving the upload

---

### `GET /jobs/{job_id}`

Returns the current state of a job.

**While running:**
```json
{ "job_id": "uuid", "status": "queued" | "processing" }
```

**On completion (same fields as current `ExtractionResponse`, plus `job_id`):**
```json
{
  "job_id": "uuid",
  "status": "success" | "partial" | "failed",
  "overall_confidence": 0.87,
  "page_count": 42,
  "blocks": [
    { "type": "heading" | "text" | "table", "content": "...", "page": 1, "confidence": 0.9 }
  ]
}
```

**Error responses:**
- `404` — unknown `job_id`

---

## Pydantic Models (`models.py`)

Existing models (`Block`, `BlockType`, `ExtractionStatus`, `ExtractionResponse`) are unchanged.

Two new models are added:

```python
class JobStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    success = "success"
    partial = "partial"
    failed = "failed"

class JobSubmitResponse(BaseModel):
    job_id: str
    status: Literal[JobStatus.queued]

class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    overall_confidence: float | None = None
    page_count: int | None = None
    blocks: list[Block] | None = None
```

---

## Backend Components

### `queue/celery_app.py`

Celery instance with SQLite broker and result backend:

```python
celery = Celery(
    "pdflow",
    broker="sqla+sqlite:///data/celery.db",
    backend="db+sqlite:///data/results.db",
)
celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
)
```

Paths are relative to the `backend/` directory — the worker must be started from there.

### `queue/tasks.py`

Single task `process_pdf(job_id: str, file_path: str) -> dict`:

1. Load the PDF from `file_path`; if missing, return a failed `ExtractionResponse` dict
2. Call `pipeline.extractor.extract(file_path)` → `(blocks, page_count)`
3. Call `pipeline.verifier.verify(blocks)` → scored blocks
4. Compute `overall_confidence` and determine `status` (existing threshold logic)
5. Delete `file_path` regardless of success or failure
6. Return the `ExtractionResponse` as a dict (Celery serialises to JSON)

Any unhandled exception is caught at the top level and returns `status: failed` — the task never raises, so Celery always marks it `SUCCESS` and the result is always readable via the result backend.

### `queue/store.py`

Thin query layer with two functions:

- `get_job_status(job_id: str) -> dict | None` — queries Celery's result backend. Returns `None` if the job is unknown, otherwise maps Celery states (`PENDING`, `STARTED`, `SUCCESS`, `FAILURE`) to `JobStatus` values and returns a `JobStatusResponse`-shaped dict.
- `job_exists(job_id: str) -> bool` — used by the route to distinguish 404 from a legitimately pending job.

### `main.py` changes

**`POST /extract`:**
1. Read file bytes; check size against `MAX_PDF_SIZE_MB` env var → 413 if exceeded
2. Check first 4 bytes for `%PDF` magic → 422 if not a PDF
3. Check content length > 0 → 422 if empty
4. Save bytes to `uploads/{job_id}.pdf`
5. Call `process_pdf.delay(job_id, file_path)`, using `job_id` as the Celery task ID (`apply_async(task_id=job_id)`) so the task ID and job ID are the same value
6. Return `JobSubmitResponse(job_id=job_id, status="queued")`

**`GET /jobs/{job_id}`:**
1. Call `store.job_exists(job_id)` → 404 if false
2. Call `store.get_job_status(job_id)` → return `JobStatusResponse`

**Startup cleanup:** On app startup, delete any files in `uploads/` older than 24 hours (handles orphaned uploads from crashed workers).

---

## Mobile Changes

### `src/api/extractionApi.ts`

Replaces the single `extractPdf()` function with two:

- `submitExtraction(file: DocumentPickerAsset): Promise<{ job_id: string }>` — POSTs to `/extract`
- `pollJobStatus(jobId: string): Promise<JobStatusResponse>` — GETs `/jobs/{job_id}`

### `src/context/LibraryContext.tsx`

`runExtraction(bookId, file)` is updated:
1. Call `submitExtraction(file)` → get `job_id`
2. Replace the preliminary book UUID with `job_id` immediately (same swap as before, just earlier)
3. Start a 60-second interval timer calling `pollJobStatus(job_id)`
4. On each poll:
   - `success` or `partial` → set `extractionStatus: 'ready'`, store result, clear timer
   - `failed` → set `extractionStatus: 'failed'`, clear timer
   - `queued` or `processing` → no-op, keep polling
   - HTTP 404 → set `extractionStatus: 'failed'`, clear timer (job was lost)
   - Network error → increment consecutive-error counter; after 5 consecutive errors, set `failed` and clear timer
5. Timer is stored in a `ref` keyed by `book_id` so multiple books can poll independently

New exported function `checkExtraction(bookId: string)`:
- Cancels the existing timer for that book
- Polls immediately
- Resets the 60-second interval

### `src/hooks/useLibrary.ts`

Exposes `checkExtraction` alongside existing API.

### `app/reader.tsx`

Adds a "check now" icon in the header, visible only when `extractionStatus === 'pending'`. Tapping calls `checkExtraction(book.id)`.

Header states:
- `pending` — toggle greyed out + check icon
- `failed` — toggle greyed out + retry icon
- `ready` — toggle active, no status icon

No changes to `ReaderContainer`, `LibraryScreen`, or any other UI component.

---

## Error Handling Summary

### At `POST /extract`

| Case | Behaviour |
|---|---|
| File exceeds `MAX_PDF_SIZE_MB` | HTTP 413 |
| Magic bytes not `%PDF` | HTTP 422 |
| Empty file | HTTP 422 |
| Disk full saving to `uploads/` | HTTP 500 |

### Inside the Celery task

| Case | Behaviour |
|---|---|
| Marker crashes or returns no blocks | `status: failed`, `blocks: []` |
| Groq batch fails | Affected batch defaults to `confidence: 0.5` |
| All Groq batches fail | `status: partial`, all blocks at `0.5` |
| Upload file missing when task runs | `status: failed` |
| Any unhandled exception | Caught at top level → `status: failed`; Celery task always completes |
| Uploaded file cleanup | Deleted by task after extraction, success or failure |

### At `GET /jobs/{job_id}`

| Case | Behaviour |
|---|---|
| Unknown `job_id` | HTTP 404 |
| Job queued but not started | `status: queued` |
| Job currently running | `status: processing` |
| Job done | Full result with `ExtractionResponse` fields |

### Mobile polling

| Case | Behaviour |
|---|---|
| `POST /extract` returns 413 or 422 | Book set to `failed` immediately, no polling started |
| Poll returns 404 | Stop polling, set book to `failed` |
| 5 consecutive network errors | Stop polling, set book to `failed` |
| Transient network error (< 5) | Keep polling at normal interval |

---

## Testing Strategy

### `tests/pipeline/test_extractor.py`
Unchanged. Tests `extract()` in isolation with real small PDF fixtures.

### `tests/pipeline/test_verifier.py`
Unchanged. Mocks Groq, tests batch scoring and fallback behaviour.

### `tests/queue/test_tasks.py` (new)
Tests `process_pdf` as a plain Python function — no Celery worker running:
- Call `process_pdf(job_id, file_path)` directly with a real small PDF fixture
- Assert returned dict has valid shape, non-empty blocks, resolved status
- Test missing-file path → `status: failed`
- Mock Groq for confidence scoring (no live API key needed)

### `tests/test_main.py` (extended)
- `POST /extract` with valid PDF → 200, `{job_id, status: "queued"}`
- `POST /extract` with oversized file → 413
- `POST /extract` with non-PDF bytes → 422
- `POST /extract` with empty file → 422
- `GET /jobs/{job_id}` with unknown ID → 404
- `GET /jobs/{job_id}` with mocked store returning `processing` → correct shape
- `GET /jobs/{job_id}` with mocked store returning completed result → full response shape

`process_pdf.delay()` is mocked in `test_main.py`. `store.get_job_status()` is mocked for status endpoint tests. No Celery worker or broker needed during tests.

---

## Out of Scope

- Authentication between mobile and backend
- Cloud hosting / deployment
- Multiple concurrent workers (single worker sufficient for local dev)
- Job history / listing all jobs
- Job cancellation
- Progress reporting within a job (percentage complete)
