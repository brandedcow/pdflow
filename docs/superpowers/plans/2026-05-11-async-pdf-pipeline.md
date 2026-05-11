# Async PDF Processing Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the synchronous `/extract` endpoint into a Celery-based async job pipeline with SQLite persistence, server polling endpoint, and mobile 60s polling with manual check.

**Architecture:** FastAPI accepts uploads, enqueues to Celery via SQLite broker, returns job_id immediately. Celery worker runs Marker + Groq, writes result to SQLite result backend. Mobile polls `GET /jobs/{job_id}` every 60s; `checkExtraction()` triggers an immediate poll and resets the timer.

**Tech Stack:** Python — Celery[sqlalchemy], SQLAlchemy, SQLite (stdlib); Mobile — React Native setInterval polling

---

## File Map

**New backend files:**
- `backend/pipeline/__init__.py` — package marker
- `backend/pipeline/extractor.py` — moved from `backend/extractor.py`
- `backend/pipeline/verifier.py` — moved from `backend/verifier.py`
- `backend/queue/__init__.py` — package marker
- `backend/queue/celery_app.py` — Celery instance + SQLite broker/backend config
- `backend/queue/tasks.py` — `process_pdf` Celery task
- `backend/queue/store.py` — job registration + status queries
- `backend/data/.gitkeep` — ensures dir is tracked; DB files are gitignored
- `backend/uploads/.gitkeep` — same for uploads dir

**Modified backend files:**
- `backend/main.py` — replace sync endpoint; add `GET /jobs/{job_id}`; lifespan cleanup
- `backend/models.py` — add `JobStatus`, `JobSubmitResponse`, `JobStatusResponse`
- `backend/requirements.txt` — add `celery[sqlalchemy]`, `sqlalchemy`
- `backend/tests/conftest.py` — add `sample_pdf_file` fixture
- `backend/tests/test_main.py` — rewrite for async API

**Moved test files:**
- `backend/tests/test_extractor.py` → `backend/tests/pipeline/test_extractor.py`
- `backend/tests/test_verifier.py` → `backend/tests/pipeline/test_verifier.py`

**New test files:**
- `backend/tests/pipeline/__init__.py`
- `backend/tests/queue/__init__.py`
- `backend/tests/queue/test_store.py`
- `backend/tests/queue/test_tasks.py`

**New mobile files:** none

**Modified mobile files:**
- `src/api/extractionApi.ts` — replace `extractPdf` with `submitExtraction` + `pollJobStatus`
- `src/context/LibraryContext.tsx` — polling loop, `checkExtraction`, timer management
- `src/types/index.ts` — simplify `ExtractionResult` (drop `book_id`)
- `src/types/generated.ts` — regenerated from backend OpenAPI
- `app/reader.tsx` — add check icon for pending state

---

## Task 1: Restructure backend into pipeline/ package

Move `extractor.py` and `verifier.py` into `pipeline/`, fix test patch targets (the existing tests patch `extractor.convert_single_pdf` which no longer exists — the current code uses `PdfConverter`), move test files.

**Files:**
- Create: `backend/pipeline/__init__.py`
- Move: `backend/extractor.py` → `backend/pipeline/extractor.py`
- Move: `backend/verifier.py` → `backend/pipeline/verifier.py`
- Create: `backend/tests/pipeline/__init__.py`
- Move: `backend/tests/test_extractor.py` → `backend/tests/pipeline/test_extractor.py`
- Move: `backend/tests/test_verifier.py` → `backend/tests/pipeline/test_verifier.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create pipeline/ package and move source files**

```bash
cd backend
mkdir pipeline
```

Create `backend/pipeline/__init__.py` as an empty file, then:

```bash
git mv extractor.py pipeline/extractor.py
git mv verifier.py pipeline/verifier.py
```

- [ ] **Step 2: Move and update test_extractor.py**

```bash
mkdir tests/pipeline
```

Create `backend/tests/pipeline/__init__.py` as an empty file.

```bash
git mv tests/test_extractor.py tests/pipeline/test_extractor.py
```

Replace the content of `backend/tests/pipeline/test_extractor.py` (the old patch targets no longer match — `convert_single_pdf` was removed, `PdfConverter` is the current API):

```python
from unittest.mock import MagicMock, patch
from models import BlockType


def teardown_function():
    import pipeline.extractor
    pipeline.extractor._model_list = None


SAMPLE_MARKDOWN = """\
# Introduction

This is a paragraph with some body text that should become a text block.

## Methods

A second paragraph under a subheading.

| Column A | Column B |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
"""


def _mock_marker(markdown: str, page_count: int = 2):
    mock_rendered = MagicMock()
    mock_rendered.markdown = markdown

    mock_instance = MagicMock()
    mock_instance.return_value = mock_rendered
    mock_instance.page_count = page_count

    return (
        patch("pipeline.extractor.PdfConverter", return_value=mock_instance),
        patch("pipeline.extractor.create_model_dict", return_value={}),
    )


def test_extract_returns_blocks_and_page_count():
    converter_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN, page_count=3)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        blocks, page_count = extract("/fake/path.pdf")
    assert page_count == 3
    assert len(blocks) > 0


def test_extract_identifies_headings():
    converter_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        blocks, _ = extract("/fake/path.pdf")
    heading_blocks = [b for b in blocks if b.type == BlockType.heading]
    assert len(heading_blocks) >= 1
    assert any("Introduction" in b.content for b in heading_blocks)


def test_extract_identifies_text():
    converter_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        blocks, _ = extract("/fake/path.pdf")
    assert any(b.type == BlockType.text for b in blocks)


def test_extract_identifies_tables():
    converter_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        blocks, _ = extract("/fake/path.pdf")
    table_blocks = [b for b in blocks if b.type == BlockType.table]
    assert len(table_blocks) == 1
    assert "Column A" in table_blocks[0].content


def test_extract_sets_confidence_to_zero():
    converter_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        blocks, _ = extract("/fake/path.pdf")
    assert all(b.confidence == 0.0 for b in blocks)


def test_extract_empty_pdf_returns_empty_blocks():
    converter_patch, models_patch = _mock_marker("", page_count=1)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        blocks, page_count = extract("/fake/path.pdf")
    assert blocks == []
    assert page_count == 1


def test_extract_uses_page_count_from_converter():
    converter_patch, models_patch = _mock_marker("# Title", page_count=1)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        _, page_count = extract("/fake/path.pdf")
    assert page_count == 1
```

- [ ] **Step 3: Move and update test_verifier.py**

```bash
git mv tests/test_verifier.py tests/pipeline/test_verifier.py
```

In `backend/tests/pipeline/test_verifier.py`, change every occurrence of:
- `from verifier import verify` → `from pipeline.verifier import verify`
- `patch("verifier.Groq")` → `patch("pipeline.verifier.Groq")`

The full updated file:

```python
import json
from unittest.mock import MagicMock, patch
from models import Block, BlockType


def make_block(content: str = "Test content", page: int = 1) -> Block:
    return Block(type=BlockType.text, content=content, page=page, confidence=0.0)


def mock_groq_response(scores: list[float]) -> MagicMock:
    mock = MagicMock()
    mock.choices[0].message.content = json.dumps({"scores": scores})
    return mock


def test_verify_attaches_confidence_scores():
    from pipeline.verifier import verify
    blocks = [make_block("Block one"), make_block("Block two")]
    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        with patch("pipeline.verifier.Groq") as MockGroq:
            MockGroq.return_value.chat.completions.create.return_value = mock_groq_response([0.92, 0.78])
            result = verify(blocks)
    assert result[0].confidence == 0.92
    assert result[1].confidence == 0.78


def test_verify_defaults_to_0_5_when_groq_raises():
    from pipeline.verifier import verify
    blocks = [make_block("Some text")]
    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        with patch("pipeline.verifier.Groq") as MockGroq:
            MockGroq.return_value.chat.completions.create.side_effect = Exception("API error")
            result = verify(blocks)
    assert result[0].confidence == 0.5


def test_verify_clamps_scores_above_1():
    from pipeline.verifier import verify
    blocks = [make_block("Some text")]
    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        with patch("pipeline.verifier.Groq") as MockGroq:
            MockGroq.return_value.chat.completions.create.return_value = mock_groq_response([1.5])
            result = verify(blocks)
    assert result[0].confidence == 1.0


def test_verify_clamps_scores_below_0():
    from pipeline.verifier import verify
    blocks = [make_block("Some text")]
    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        with patch("pipeline.verifier.Groq") as MockGroq:
            MockGroq.return_value.chat.completions.create.return_value = mock_groq_response([-0.2])
            result = verify(blocks)
    assert result[0].confidence == 0.0


def test_verify_processes_multiple_batches():
    from pipeline.verifier import verify
    blocks = [make_block(f"Block {i}") for i in range(25)]
    call_count = 0

    def side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        n = 20 if call_count == 1 else 5
        return mock_groq_response([0.9] * n)

    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        with patch("pipeline.verifier.Groq") as MockGroq:
            MockGroq.return_value.chat.completions.create.side_effect = side_effect
            result = verify(blocks)
    assert call_count == 2
    assert len(result) == 25
    assert all(b.confidence == 0.9 for b in result)


def test_verify_second_batch_fallback_does_not_affect_first():
    from pipeline.verifier import verify
    blocks = [make_block(f"Block {i}") for i in range(25)]
    call_count = 0

    def side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return mock_groq_response([0.95] * 20)
        raise Exception("Second batch failed")

    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        with patch("pipeline.verifier.Groq") as MockGroq:
            MockGroq.return_value.chat.completions.create.side_effect = side_effect
            result = verify(blocks)
    assert all(b.confidence == 0.95 for b in result[:20])
    assert all(b.confidence == 0.5 for b in result[20:])
```

- [ ] **Step 4: Update main.py imports**

In `backend/main.py` change:
```python
from extractor import extract
from verifier import verify
```
to:
```python
from pipeline.extractor import extract
from pipeline.verifier import verify
```

- [ ] **Step 5: Run tests**

```bash
cd backend && .venv\Scripts\activate && pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/pipeline/ backend/tests/pipeline/ backend/main.py
git commit -m "refactor: move extractor and verifier into pipeline/ package, fix test patch targets"
```

---

## Task 2: Add Celery infrastructure

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/queue/__init__.py`
- Create: `backend/queue/celery_app.py`
- Create: `backend/data/.gitkeep`
- Create: `backend/uploads/.gitkeep`
- Modify: root `.gitignore`

- [ ] **Step 1: Add dependencies**

Add to `backend/requirements.txt`:
```
celery[sqlalchemy]>=5.3.0
sqlalchemy>=2.0.0
```

Install:
```bash
cd backend && .venv\Scripts\activate && pip install "celery[sqlalchemy]>=5.3.0" "sqlalchemy>=2.0.0"
```

- [ ] **Step 2: Create queue/ package**

Create `backend/queue/__init__.py` as an empty file.

- [ ] **Step 3: Create queue/celery_app.py**

```python
from pathlib import Path
from celery import Celery

_BASE_DIR = Path(__file__).parent.parent
_DATA_DIR = _BASE_DIR / "data"
_DATA_DIR.mkdir(exist_ok=True)

celery_app = Celery(
    "pdflow",
    broker=f"sqla+sqlite:///{_DATA_DIR}/celery.db",
    backend=f"db+sqlite:///{_DATA_DIR}/results.db",
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    broker_connection_retry_on_startup=True,
)
```

- [ ] **Step 4: Create runtime dirs and update .gitignore**

Create `backend/data/.gitkeep` and `backend/uploads/.gitkeep` as empty files.

Add to the project root `.gitignore`:
```
backend/data/*.db
backend/uploads/*.pdf
```

- [ ] **Step 5: Verify import**

```bash
cd backend && .venv\Scripts\activate && python -c "from queue.celery_app import celery_app; print('OK:', celery_app)"
```

Expected: prints `OK: <Celery pdflow ...>` with no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/queue/ backend/data/.gitkeep backend/uploads/.gitkeep backend/requirements.txt .gitignore
git commit -m "feat: add Celery with SQLite broker and result backend"
```

---

## Task 3: Add new Pydantic models

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/tests/test_models.py`

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/test_models.py`:

```python
from models import Block, BlockType, JobStatus, JobStatusResponse, JobSubmitResponse


def test_job_submit_response_shape():
    r = JobSubmitResponse(job_id="abc-123", status="queued")
    assert r.job_id == "abc-123"
    assert r.status == "queued"


def test_job_status_response_processing_has_no_result_fields():
    r = JobStatusResponse(job_id="abc-123", status=JobStatus.processing)
    assert r.status == JobStatus.processing
    assert r.overall_confidence is None
    assert r.blocks is None
    assert r.page_count is None


def test_job_status_response_success_with_result():
    block = Block(type=BlockType.text, content="Hello", page=1, confidence=0.9)
    r = JobStatusResponse(
        job_id="abc-123",
        status=JobStatus.success,
        overall_confidence=0.9,
        page_count=3,
        blocks=[block],
    )
    assert r.overall_confidence == 0.9
    assert len(r.blocks) == 1
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && .venv\Scripts\activate && pytest tests/test_models.py -v
```

Expected: FAIL — `ImportError: cannot import name 'JobStatus'`

- [ ] **Step 3: Add models to models.py**

Add `from typing import Literal` at the top of `backend/models.py`, then append after the existing `ExtractionStatus` class:

```python
class JobStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    success = "success"
    partial = "partial"
    failed = "failed"


class JobSubmitResponse(BaseModel):
    job_id: str
    status: Literal["queued"]


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    overall_confidence: float | None = None
    page_count: int | None = None
    blocks: list[Block] | None = None
```

- [ ] **Step 4: Run tests**

```bash
cd backend && .venv\Scripts\activate && pytest tests/test_models.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/tests/test_models.py
git commit -m "feat: add JobStatus, JobSubmitResponse, JobStatusResponse models"
```

---

## Task 4: Implement queue/store.py

A thin SQLite table tracking submitted job IDs (separate from Celery's result backend). This lets us distinguish "job exists but hasn't started" from "unknown job ID" — Celery's `PENDING` state covers both cases.

**Files:**
- Create: `backend/queue/store.py`
- Create: `backend/tests/queue/__init__.py`
- Create: `backend/tests/queue/test_store.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/queue/__init__.py` as an empty file.

Create `backend/tests/queue/test_store.py`:

```python
import pytest
from pathlib import Path
from unittest.mock import patch


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    monkeypatch.setattr("queue.store._DB_PATH", tmp_path / "jobs.db")


def test_unknown_job_does_not_exist():
    from queue.store import job_exists
    assert job_exists("nonexistent-id") is False


def test_job_exists_after_registration():
    from queue.store import job_exists, register_job
    register_job("job-1")
    assert job_exists("job-1") is True


def test_get_status_queued_for_celery_pending():
    from queue.store import get_job_status, register_job
    register_job("job-pending")
    with patch("queue.store.AsyncResult") as MockResult:
        MockResult.return_value.state = "PENDING"
        result = get_job_status("job-pending")
    assert result == {"job_id": "job-pending", "status": "queued"}


def test_get_status_processing_for_celery_started():
    from queue.store import get_job_status, register_job
    register_job("job-started")
    with patch("queue.store.AsyncResult") as MockResult:
        MockResult.return_value.state = "STARTED"
        result = get_job_status("job-started")
    assert result["status"] == "processing"


def test_get_status_returns_task_result_on_success():
    from queue.store import get_job_status, register_job
    register_job("job-done")
    expected = {
        "job_id": "job-done",
        "status": "success",
        "overall_confidence": 0.9,
        "page_count": 2,
        "blocks": [],
    }
    with patch("queue.store.AsyncResult") as MockResult:
        MockResult.return_value.state = "SUCCESS"
        MockResult.return_value.get.return_value = expected
        result = get_job_status("job-done")
    assert result == expected


def test_get_status_returns_failed_on_celery_failure():
    from queue.store import get_job_status, register_job
    register_job("job-failed")
    with patch("queue.store.AsyncResult") as MockResult:
        MockResult.return_value.state = "FAILURE"
        result = get_job_status("job-failed")
    assert result["status"] == "failed"
    assert result["job_id"] == "job-failed"
```

- [ ] **Step 2: Verify failure**

```bash
cd backend && .venv\Scripts\activate && pytest tests/queue/test_store.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'queue.store'`

- [ ] **Step 3: Create queue/store.py**

```python
import sqlite3
from pathlib import Path
from celery.result import AsyncResult
from queue.celery_app import celery_app

_DB_PATH = Path(__file__).parent.parent / "data" / "jobs.db"


def _init_db(path: Path) -> None:
    with sqlite3.connect(str(path)) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS submitted_jobs "
            "(job_id TEXT PRIMARY KEY, "
            "submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        )


def register_job(job_id: str) -> None:
    _init_db(_DB_PATH)
    with sqlite3.connect(str(_DB_PATH)) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO submitted_jobs (job_id) VALUES (?)", (job_id,)
        )


def job_exists(job_id: str) -> bool:
    _init_db(_DB_PATH)
    with sqlite3.connect(str(_DB_PATH)) as conn:
        row = conn.execute(
            "SELECT 1 FROM submitted_jobs WHERE job_id = ?", (job_id,)
        ).fetchone()
        return row is not None


def get_job_status(job_id: str) -> dict:
    result = AsyncResult(job_id, app=celery_app)
    state = result.state
    if state in ("PENDING", "RECEIVED"):
        return {"job_id": job_id, "status": "queued"}
    elif state == "STARTED":
        return {"job_id": job_id, "status": "processing"}
    elif state == "SUCCESS":
        return result.get()
    else:
        return {
            "job_id": job_id,
            "status": "failed",
            "overall_confidence": 0.0,
            "page_count": 1,
            "blocks": [],
        }
```

- [ ] **Step 4: Run tests**

```bash
cd backend && .venv\Scripts\activate && pytest tests/queue/test_store.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/queue/store.py backend/tests/queue/
git commit -m "feat: add job store for registration and status queries"
```

---

## Task 5: Implement process_pdf Celery task

**Files:**
- Create: `backend/queue/tasks.py`
- Create: `backend/tests/queue/test_tasks.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Add sample_pdf_file fixture to conftest.py**

Add to `backend/tests/conftest.py`:

```python
@pytest.fixture
def sample_pdf_file(tmp_path, sample_pdf_bytes):
    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(sample_pdf_bytes)
    return str(pdf_path)
```

- [ ] **Step 2: Write failing tests**

Create `backend/tests/queue/test_tasks.py`:

```python
import json
from pathlib import Path
from unittest.mock import MagicMock, patch
from models import Block, BlockType


def _make_block(confidence: float = 0.9) -> Block:
    return Block(type=BlockType.text, content="Test content", page=1, confidence=confidence)


def test_process_pdf_returns_success_for_high_confidence(sample_pdf_file):
    from queue.tasks import process_pdf
    with patch("queue.tasks.extract") as mock_extract, \
         patch("queue.tasks.verify") as mock_verify:
        mock_extract.return_value = ([_make_block(0.0)], 2)
        mock_verify.return_value = [_make_block(0.9)]
        result = process_pdf("job-1", sample_pdf_file)
    assert result["status"] == "success"
    assert result["job_id"] == "job-1"
    assert result["overall_confidence"] == 0.9
    assert result["page_count"] == 2
    assert len(result["blocks"]) == 1


def test_process_pdf_returns_partial_for_medium_confidence(sample_pdf_file):
    from queue.tasks import process_pdf
    with patch("queue.tasks.extract") as mock_extract, \
         patch("queue.tasks.verify") as mock_verify:
        mock_extract.return_value = ([_make_block(0.0)], 1)
        mock_verify.return_value = [_make_block(0.65)]
        result = process_pdf("job-2", sample_pdf_file)
    assert result["status"] == "partial"


def test_process_pdf_returns_failed_for_low_confidence(sample_pdf_file):
    from queue.tasks import process_pdf
    with patch("queue.tasks.extract") as mock_extract, \
         patch("queue.tasks.verify") as mock_verify:
        mock_extract.return_value = ([_make_block(0.0)], 1)
        mock_verify.return_value = [_make_block(0.3)]
        result = process_pdf("job-3", sample_pdf_file)
    assert result["status"] == "failed"


def test_process_pdf_returns_failed_when_no_blocks(sample_pdf_file):
    from queue.tasks import process_pdf
    with patch("queue.tasks.extract") as mock_extract:
        mock_extract.return_value = ([], 1)
        result = process_pdf("job-4", sample_pdf_file)
    assert result["status"] == "failed"
    assert result["blocks"] == []


def test_process_pdf_returns_failed_when_extraction_raises(sample_pdf_file):
    from queue.tasks import process_pdf
    with patch("queue.tasks.extract") as mock_extract:
        mock_extract.side_effect = Exception("Marker crashed")
        result = process_pdf("job-5", sample_pdf_file)
    assert result["status"] == "failed"


def test_process_pdf_deletes_file_on_success(sample_pdf_file):
    from queue.tasks import process_pdf
    with patch("queue.tasks.extract") as mock_extract, \
         patch("queue.tasks.verify") as mock_verify:
        mock_extract.return_value = ([_make_block(0.0)], 1)
        mock_verify.return_value = [_make_block(0.9)]
        process_pdf("job-6", sample_pdf_file)
    assert not Path(sample_pdf_file).exists()


def test_process_pdf_deletes_file_on_failure(tmp_path, sample_pdf_bytes):
    from queue.tasks import process_pdf
    pdf = tmp_path / "fail.pdf"
    pdf.write_bytes(sample_pdf_bytes)
    with patch("queue.tasks.extract") as mock_extract:
        mock_extract.side_effect = Exception("crash")
        process_pdf("job-7", str(pdf))
    assert not pdf.exists()


def test_process_pdf_returns_failed_for_missing_file():
    from queue.tasks import process_pdf
    result = process_pdf("job-8", "/nonexistent/path.pdf")
    assert result["status"] == "failed"
    assert result["blocks"] == []


def test_process_pdf_result_is_json_serializable(sample_pdf_file):
    from queue.tasks import process_pdf
    with patch("queue.tasks.extract") as mock_extract, \
         patch("queue.tasks.verify") as mock_verify:
        mock_extract.return_value = ([_make_block(0.0)], 1)
        mock_verify.return_value = [_make_block(0.9)]
        result = process_pdf("job-9", sample_pdf_file)
    json.dumps(result)  # Celery serialises the return value to JSON
```

- [ ] **Step 3: Verify failure**

```bash
cd backend && .venv\Scripts\activate && pytest tests/queue/test_tasks.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'queue.tasks'`

- [ ] **Step 4: Create queue/tasks.py**

```python
import logging
from pathlib import Path
from queue.celery_app import celery_app
from pipeline.extractor import extract
from pipeline.verifier import verify

logger = logging.getLogger(__name__)


@celery_app.task
def process_pdf(job_id: str, file_path: str) -> dict:
    try:
        if not Path(file_path).exists():
            return {
                "job_id": job_id,
                "status": "failed",
                "overall_confidence": 0.0,
                "page_count": 1,
                "blocks": [],
            }

        try:
            blocks, page_count = extract(file_path)
        except Exception:
            logger.error("Extraction failed for %s", job_id, exc_info=True)
            return {
                "job_id": job_id,
                "status": "failed",
                "overall_confidence": 0.0,
                "page_count": 1,
                "blocks": [],
            }

        if not blocks:
            return {
                "job_id": job_id,
                "status": "failed",
                "overall_confidence": 0.0,
                "page_count": page_count,
                "blocks": [],
            }

        scored_blocks = verify(blocks)
        overall_confidence = round(
            sum(b.confidence for b in scored_blocks) / len(scored_blocks), 3
        )

        if overall_confidence >= 0.8:
            status = "success"
        elif overall_confidence >= 0.5:
            status = "partial"
        else:
            status = "failed"

        return {
            "job_id": job_id,
            "status": status,
            "overall_confidence": overall_confidence,
            "page_count": page_count,
            "blocks": [b.model_dump() for b in scored_blocks],
        }
    finally:
        Path(file_path).unlink(missing_ok=True)
```

- [ ] **Step 5: Run tests**

```bash
cd backend && .venv\Scripts\activate && pytest tests/queue/test_tasks.py -v
```

Expected: all pass.

- [ ] **Step 6: Run all backend tests**

```bash
cd backend && .venv\Scripts\activate && pytest tests/ -v
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/queue/tasks.py backend/tests/queue/test_tasks.py backend/tests/conftest.py
git commit -m "feat: add process_pdf Celery task with extraction pipeline"
```

---

## Task 6: Refactor main.py

Replace the synchronous endpoint with async job submission. Add `GET /jobs/{job_id}`. Add lifespan startup cleanup for orphaned uploads.

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Replace main.py**

```python
import logging
import os
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
    force=True,
)
logger = logging.getLogger(__name__)

load_dotenv(Path(__file__).parent.parent / ".env.local")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError(
        "GROQ_API_KEY is not set. Add it to .env.local at the project root."
    )

MAX_PDF_SIZE_BYTES = int(os.environ.get("MAX_PDF_SIZE_MB", "100")) * 1024 * 1024
UPLOADS_DIR = Path(__file__).parent / "uploads"

from models import JobStatusResponse, JobSubmitResponse
from queue.store import get_job_status, job_exists, register_job
from queue.tasks import process_pdf


@asynccontextmanager
async def lifespan(app: FastAPI):
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    cutoff = datetime.now() - timedelta(hours=24)
    for f in UPLOADS_DIR.glob("*.pdf"):
        if datetime.fromtimestamp(f.stat().st_mtime) < cutoff:
            f.unlink(missing_ok=True)
            logger.info("Purged orphaned upload: %s", f.name)
    yield


app = FastAPI(title="pdflow extraction API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/extract", response_model=JobSubmitResponse)
async def submit_extraction(pdf_file: UploadFile = File(...)) -> JobSubmitResponse:
    content = await pdf_file.read()

    if len(content) == 0:
        raise HTTPException(status_code=422, detail="File is empty")

    if len(content) > MAX_PDF_SIZE_BYTES:
        max_mb = MAX_PDF_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"File exceeds {max_mb}MB limit")

    if not content.startswith(b"%PDF"):
        raise HTTPException(status_code=422, detail="File is not a valid PDF")

    job_id = str(uuid.uuid4())
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    file_path = str(UPLOADS_DIR / f"{job_id}.pdf")

    try:
        Path(file_path).write_bytes(content)
    except OSError as e:
        logger.error("Failed to write upload for %s: %s", job_id, e)
        raise HTTPException(status_code=500, detail="Failed to save uploaded file") from e

    register_job(job_id)
    process_pdf.apply_async(args=[job_id, file_path], task_id=job_id)

    return JobSubmitResponse(job_id=job_id, status="queued")


@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: str) -> JobStatusResponse:
    if not job_exists(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(**get_job_status(job_id))
```

- [ ] **Step 2: Commit**

```bash
git add backend/main.py
git commit -m "feat: async job submission endpoint and GET /jobs/{job_id}"
```

---

## Task 7: Update test_main.py

**Files:**
- Modify: `backend/tests/test_main.py`

- [ ] **Step 1: Replace test_main.py**

```python
from unittest.mock import MagicMock, patch


def _completed_result(status: str = "success", confidence: float = 0.9) -> dict:
    return {
        "job_id": "test-job-id",
        "status": status,
        "overall_confidence": confidence,
        "page_count": 2,
        "blocks": [{"type": "text", "content": "Test", "page": 1, "confidence": confidence}],
    }


def test_submit_returns_job_id_and_queued_status(client, sample_pdf_bytes, tmp_path):
    with patch("main.process_pdf") as mock_task, \
         patch("main.register_job"), \
         patch("main.UPLOADS_DIR", tmp_path):
        mock_task.apply_async.return_value = MagicMock()
        response = client.post(
            "/extract",
            files={"pdf_file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )
    assert response.status_code == 200
    data = response.json()
    assert len(data["job_id"]) == 36
    assert data["status"] == "queued"


def test_submit_job_ids_are_unique(client, sample_pdf_bytes, tmp_path):
    with patch("main.process_pdf") as mock_task, \
         patch("main.register_job"), \
         patch("main.UPLOADS_DIR", tmp_path):
        mock_task.apply_async.return_value = MagicMock()
        r1 = client.post("/extract", files={"pdf_file": ("a.pdf", sample_pdf_bytes, "application/pdf")})
        r2 = client.post("/extract", files={"pdf_file": ("b.pdf", sample_pdf_bytes, "application/pdf")})
    assert r1.json()["job_id"] != r2.json()["job_id"]


def test_submit_returns_413_for_oversized_file(client, sample_pdf_bytes):
    with patch("main.MAX_PDF_SIZE_BYTES", 10):
        response = client.post(
            "/extract",
            files={"pdf_file": ("big.pdf", sample_pdf_bytes, "application/pdf")},
        )
    assert response.status_code == 413


def test_submit_returns_422_for_non_pdf_bytes(client):
    response = client.post(
        "/extract",
        files={"pdf_file": ("fake.pdf", b"not a pdf at all", "application/pdf")},
    )
    assert response.status_code == 422


def test_submit_returns_422_for_empty_file(client):
    response = client.post(
        "/extract",
        files={"pdf_file": ("empty.pdf", b"", "application/pdf")},
    )
    assert response.status_code == 422


def test_get_job_returns_404_for_unknown_id(client):
    with patch("main.job_exists", return_value=False):
        response = client.get("/jobs/nonexistent-id")
    assert response.status_code == 404


def test_get_job_returns_processing_status(client):
    with patch("main.job_exists", return_value=True), \
         patch("main.get_job_status", return_value={"job_id": "abc", "status": "processing"}):
        response = client.get("/jobs/abc")
    assert response.status_code == 200
    assert response.json()["status"] == "processing"


def test_get_job_returns_queued_while_pending(client):
    with patch("main.job_exists", return_value=True), \
         patch("main.get_job_status", return_value={"job_id": "abc", "status": "queued"}):
        response = client.get("/jobs/abc")
    assert response.json()["status"] == "queued"


def test_get_job_returns_full_result_on_success(client):
    with patch("main.job_exists", return_value=True), \
         patch("main.get_job_status", return_value=_completed_result("success")):
        response = client.get("/jobs/test-job-id")
    data = response.json()
    assert data["status"] == "success"
    assert data["overall_confidence"] == 0.9
    assert len(data["blocks"]) == 1


def test_get_job_returns_full_result_on_partial(client):
    with patch("main.job_exists", return_value=True), \
         patch("main.get_job_status", return_value=_completed_result("partial", 0.65)):
        response = client.get("/jobs/test-job-id")
    assert response.json()["status"] == "partial"


def test_openapi_schema_is_reachable(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "paths" in response.json()
```

- [ ] **Step 2: Run all backend tests**

```bash
cd backend && .venv\Scripts\activate && pytest tests/ -v
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_main.py
git commit -m "test: rewrite test_main.py for async job API"
```

---

## Task 8: Regenerate TypeScript types and update src/types/index.ts

**Files:**
- Regenerate: `src/types/generated.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Start the backend**

```bash
cd backend && .venv\Scripts\activate && uvicorn main:app --reload
```

Wait for "Application startup complete."

- [ ] **Step 2: Regenerate types**

In a separate terminal:
```bash
npm run generate:types
```

Expected: `src/types/generated.ts` is updated. Verify it contains `JobSubmitResponse` and `JobStatusResponse` schemas.

- [ ] **Step 3: Update src/types/index.ts**

`ExtractionResult` is simplified — `book_id` is dropped (the job_id is now `book.id`; status is tracked in `book.extractionStatus`):

```typescript
import type { components } from './generated';

export type ExtractionBlock = components['schemas']['Block'];

export type ExtractionResult = {
  overall_confidence: number;
  page_count: number;
  blocks: ExtractionBlock[];
};

export type ExtractionStatus = 'pending' | 'ready' | 'failed';

export type Book = {
  id: string;
  filename: string;
  path: string;
  addedAt: string;
  extractionStatus: ExtractionStatus;
  extractionResult?: ExtractionResult;
};
```

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```

Expected: errors only in files that still import `extractPdf` — those are fixed in the next two tasks.

- [ ] **Step 5: Commit**

```bash
git add src/types/generated.ts src/types/index.ts
git commit -m "feat: regenerate types for async job API, simplify ExtractionResult"
```

---

## Task 9: Update extractionApi.ts

**Files:**
- Modify: `src/api/extractionApi.ts`

- [ ] **Step 1: Replace extractionApi.ts**

```typescript
import Constants from 'expo-constants';

const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  (devHost ? `http://${devHost}:8000` : 'http://localhost:8000');

export type JobStatusResponse = {
  job_id: string;
  status: 'queued' | 'processing' | 'success' | 'partial' | 'failed';
  overall_confidence?: number;
  page_count?: number;
  blocks?: Array<{
    type: 'heading' | 'text' | 'table';
    content: string;
    page: number;
    confidence: number;
  }>;
};

export async function submitExtraction(fileUri: string): Promise<{ job_id: string }> {
  console.log(`[ExtractionAPI] Submitting PDF: ${fileUri}`);
  const formData = new FormData();
  // @ts-ignore - FormData.append expects Blob/File but RN accepts this shape
  formData.append('pdf_file', {
    uri: fileUri,
    name: fileUri.split('/').pop() ?? 'upload.pdf',
    type: 'application/pdf',
  });

  const response = await fetch(`${BACKEND_URL}/extract`, {
    method: 'POST',
    body: formData,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'multipart/form-data',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Submit failed: ${response.status} ${text}`);
  }

  return response.json();
}

export async function pollJobStatus(jobId: string): Promise<JobStatusResponse> {
  console.log(`[ExtractionAPI] Polling job: ${jobId}`);
  const response = await fetch(`${BACKEND_URL}/jobs/${jobId}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Poll failed: ${response.status}`);
  }

  return response.json();
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: errors only in `LibraryContext.tsx` (still imports `extractPdf`).

- [ ] **Step 3: Commit**

```bash
git add src/api/extractionApi.ts
git commit -m "feat: replace extractPdf with submitExtraction and pollJobStatus"
```

---

## Task 10: Refactor LibraryContext.tsx

**Files:**
- Modify: `src/context/LibraryContext.tsx`

- [ ] **Step 1: Replace LibraryContext.tsx**

```typescript
import React, { createContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { File as FSFile } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { Book, ExtractionBlock, ExtractionResult, ExtractionStatus } from '../types';
import { loadBooks, saveBook, replaceBook, deleteBook as storageDeleteBook } from '../storage/storage';
import { JobStatusResponse, pollJobStatus, submitExtraction } from '../api/extractionApi';

type LibraryContextType = {
  books: Book[];
  importBook: () => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  retryExtraction: (bookId: string) => Promise<void>;
  checkExtraction: (bookId: string) => Promise<void>;
};

export const LibraryContext = createContext<LibraryContextType | null>(null);

const POLL_INTERVAL_MS = 60_000;
const MAX_CONSECUTIVE_ERRORS = 5;

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);
  const booksRef = useRef<Book[]>([]);
  const pollTimersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const consecutiveErrorsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  useEffect(() => {
    loadBooks().then((loaded) => {
      setBooks(loaded);
      loaded
        .filter((b) => b.extractionStatus === 'pending')
        .forEach((b) => startPolling(b.id));
    });
    return () => {
      Object.values(pollTimersRef.current).forEach(clearInterval);
    };
  }, []);

  function clearPollTimer(bookId: string): void {
    const timer = pollTimersRef.current[bookId];
    if (timer !== undefined) {
      clearInterval(timer);
      delete pollTimersRef.current[bookId];
    }
    delete consecutiveErrorsRef.current[bookId];
  }

  function startPolling(jobId: string): void {
    clearPollTimer(jobId);
    pollTimersRef.current[jobId] = setInterval(
      () => void pollOnce(jobId),
      POLL_INTERVAL_MS
    );
  }

  async function markFailed(bookId: string): Promise<void> {
    const book = booksRef.current.find((b) => b.id === bookId);
    if (!book) return;
    const failedBook: Book = { ...book, extractionStatus: 'failed' };
    await replaceBook(bookId, failedBook);
    setBooks((prev) => prev.map((b) => (b.id === bookId ? failedBook : b)));
  }

  async function pollOnce(jobId: string): Promise<void> {
    try {
      const response = await pollJobStatus(jobId);
      consecutiveErrorsRef.current[jobId] = 0;

      if (response.status === 'success' || response.status === 'partial') {
        clearPollTimer(jobId);
        const result: ExtractionResult = {
          overall_confidence: response.overall_confidence!,
          page_count: response.page_count!,
          blocks: response.blocks as ExtractionBlock[],
        };
        const book = booksRef.current.find((b) => b.id === jobId);
        if (!book) return;
        const updatedBook: Book = { ...book, extractionStatus: 'ready', extractionResult: result };
        await replaceBook(jobId, updatedBook);
        setBooks((prev) => prev.map((b) => (b.id === jobId ? updatedBook : b)));
      } else if (response.status === 'failed') {
        clearPollTimer(jobId);
        await markFailed(jobId);
      }
      // queued/processing: keep polling
    } catch (e: any) {
      if (String(e?.message).includes('404')) {
        clearPollTimer(jobId);
        await markFailed(jobId);
        return;
      }
      consecutiveErrorsRef.current[jobId] =
        (consecutiveErrorsRef.current[jobId] ?? 0) + 1;
      if (consecutiveErrorsRef.current[jobId] >= MAX_CONSECUTIVE_ERRORS) {
        clearPollTimer(jobId);
        await markFailed(jobId);
      }
    }
  }

  async function runExtraction(currentId: string, book: Book): Promise<void> {
    const destDir = `${FileSystem.documentDirectory}pdfs/`;
    try {
      const { job_id } = await submitExtraction(book.path);
      const finalPath = `${destDir}${job_id}-${book.filename}`;
      if (finalPath !== book.path) {
        await new FSFile(book.path).move(new FSFile(finalPath));
      }
      const updatedBook: Book = { ...book, id: job_id, path: finalPath };
      await replaceBook(currentId, updatedBook);
      setBooks((prev) => prev.map((b) => (b.id === currentId ? updatedBook : b)));
      startPolling(job_id);
    } catch {
      const failedBook: Book = { ...book, extractionStatus: 'failed' };
      await replaceBook(currentId, failedBook);
      setBooks((prev) => prev.map((b) => (b.id === currentId ? failedBook : b)));
    }
  }

  async function importBook(): Promise<void> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: false,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const isDuplicate = books.some((b) => b.filename === asset.name);
    if (isDuplicate) {
      Alert.alert('Already in library', `"${asset.name}" is already in your library.`);
      return;
    }

    const pendingId = Crypto.randomUUID();
    const destDir = `${FileSystem.documentDirectory}pdfs/`;
    const pendingPath = `${destDir}${pendingId}-${asset.name}`;

    try {
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      await FileSystem.copyAsync({ from: asset.uri, to: pendingPath });
    } catch {
      Alert.alert('Import failed', "Couldn't import file");
      return;
    }

    const pendingBook: Book = {
      id: pendingId,
      filename: asset.name,
      path: pendingPath,
      addedAt: new Date().toISOString(),
      extractionStatus: 'pending',
    };

    await saveBook(pendingBook);
    setBooks((prev) => [...prev, pendingBook]);
    await runExtraction(pendingId, pendingBook);
  }

  async function retryExtraction(bookId: string): Promise<void> {
    const book = books.find((b) => b.id === bookId);
    if (!book || book.extractionStatus !== 'failed') return;
    const pendingBook: Book = { ...book, extractionStatus: 'pending' };
    await replaceBook(bookId, pendingBook);
    setBooks((prev) => prev.map((b) => (b.id === bookId ? pendingBook : b)));
    await runExtraction(bookId, pendingBook);
  }

  async function checkExtraction(bookId: string): Promise<void> {
    const book = booksRef.current.find((b) => b.id === bookId);
    if (!book || book.extractionStatus !== 'pending') return;
    clearPollTimer(bookId);
    await pollOnce(bookId);
    if (booksRef.current.find((b) => b.id === bookId)?.extractionStatus === 'pending') {
      startPolling(bookId);
    }
  }

  async function deleteBook(id: string): Promise<void> {
    clearPollTimer(id);
    const book = books.find((b) => b.id === id);
    if (!book) return;
    try {
      const file = new FSFile(book.path);
      if (file.exists) file.delete();
    } catch (e) {
      console.error('[deleteBook] file delete failed:', book.path, e);
      Alert.alert('Delete failed', "Couldn't delete the book");
      return;
    }
    await storageDeleteBook(id);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <LibraryContext.Provider
      value={{ books, importBook, deleteBook, retryExtraction, checkExtraction }}
    >
      {children}
    </LibraryContext.Provider>
  );
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/context/LibraryContext.tsx
git commit -m "feat: polling-based extraction flow with checkExtraction and timer management"
```

---

## Task 11: Update reader.tsx — add check icon for pending state

**Files:**
- Modify: `app/reader.tsx`

- [ ] **Step 1: Update reader.tsx**

Add `checkExtraction` from `useLibrary`, add the check icon for pending state. Full file:

```typescript
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLibrary } from '../src/hooks/useLibrary';
import ReaderContainer from '../src/components/reader/ReaderContainer';

type ActiveView = 'pdf' | 'reader';

export default function ReaderScreen() {
  const { bookId, uri } = useLocalSearchParams<{ bookId: string; uri: string }>();
  const { books, retryExtraction, checkExtraction } = useLibrary();
  const insets = useSafeAreaInsets();
  const book = books.find((b) => b.id === bookId);

  const [activeView, setActiveView] = useState<ActiveView>(
    book?.extractionStatus === 'ready' ? 'reader' : 'pdf'
  );

  const canToggle = book?.extractionStatus === 'ready';
  const canRetry = book?.extractionStatus === 'failed';
  const isPending = book?.extractionStatus === 'pending';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {isPending && (
            <TouchableOpacity
              onPress={() => { if (bookId) void checkExtraction(bookId); }}
              style={styles.headerIcon}
              accessibilityLabel="Check extraction status"
            >
              <Ionicons name="sync-outline" size={22} color="#111" />
            </TouchableOpacity>
          )}
          {canRetry && (
            <TouchableOpacity
              onPress={() => { if (bookId) void retryExtraction(bookId); }}
              style={styles.headerIcon}
              accessibilityLabel="Retry extraction"
            >
              <Ionicons name="refresh-outline" size={22} color="#111" />
            </TouchableOpacity>
          )}
          {(canToggle || isPending) && (
            <TouchableOpacity
              onPress={() => setActiveView((v) => (v === 'reader' ? 'pdf' : 'reader'))}
              disabled={!canToggle}
              style={[styles.headerIcon, !canToggle && styles.headerIconDisabled]}
              accessibilityLabel="Toggle view"
            >
              <Ionicons
                name={activeView === 'reader' ? 'document-outline' : 'document-text-outline'}
                size={22}
                color={canToggle ? '#111' : '#ccc'}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <ReaderContainer book={book} uri={uri} activeView={activeView} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  backButton: { fontSize: 16, color: '#111' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { padding: 4 },
  headerIconDisabled: { opacity: 0.4 },
});
```

- [ ] **Step 2: Type check and lint**

```bash
npx tsc --noEmit && npx eslint src/ app/
```

Expected: no errors.

- [ ] **Step 3: Run mobile tests**

```bash
npx jest --no-coverage
```

Expected: all pass. If `LibraryContext` tests fail because they mock `extractPdf`, update those mocks:

Find `jest.mock('../src/api/extractionApi')` usages that mock `extractPdf` and change them to mock `submitExtraction` and `pollJobStatus`:

```typescript
// Before
(extractPdf as jest.Mock).mockResolvedValue({ book_id: 'id', status: 'success', ... });

// After
(submitExtraction as jest.Mock).mockResolvedValue({ job_id: 'backend-id' });
(pollJobStatus as jest.Mock).mockResolvedValue({
  job_id: 'backend-id',
  status: 'success',
  overall_confidence: 0.9,
  page_count: 2,
  blocks: [],
});
```

Since polling uses `setInterval`, tests that assert `extractionStatus === 'ready'` must advance timers. Add `jest.useFakeTimers()` in `beforeEach` and call `await jest.advanceTimersByTimeAsync(60_000)` to trigger the poll interval.

- [ ] **Step 4: Commit**

```bash
git add app/reader.tsx
git commit -m "feat: add sync-outline check icon in reader header for pending extraction"
```

---

## Task 12: Smoke test end-to-end

Verify the full flow works with the three processes running simultaneously.

- [ ] **Step 1: Start all three processes**

Terminal 1 — backend API:
```bash
cd backend && .venv\Scripts\activate && uvicorn main:app --reload
```

Terminal 2 — Celery worker (Windows requires `--pool=solo`):
```bash
cd backend && .venv\Scripts\activate && celery -A queue.celery_app worker --loglevel=info --pool=solo
```

Terminal 3 — Expo dev server:
```bash
npm start
```

- [ ] **Step 2: Submit a job via curl**

```bash
curl -X POST http://localhost:8000/extract -F "pdf_file=@path/to/small.pdf"
```

Expected:
```json
{"job_id": "<uuid>", "status": "queued"}
```

- [ ] **Step 3: Poll until complete**

```bash
curl http://localhost:8000/jobs/<uuid>
```

Run repeatedly. Expected sequence: `queued` → `processing` → `success` (or `partial`/`failed`).

- [ ] **Step 4: Verify worker log shows task completion**

The Celery worker terminal should print the task ID received and the result state.

- [ ] **Step 5: Test in the app**

Import a PDF in the mobile app. Confirm:
- Book appears immediately with `pending` status
- Toggle icon is greyed, check icon (sync-outline) is visible
- Tapping the check icon triggers an immediate poll
- After the job completes, book transitions to `ready` and the toggle becomes active
