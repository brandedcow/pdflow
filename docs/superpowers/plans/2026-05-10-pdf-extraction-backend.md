# PDF Extraction Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python FastAPI service that accepts a PDF file, extracts structured text and tables using Marker, verifies the output with Groq, and returns a confidence-scored JSON response.

**Architecture:** Single `POST /extract` endpoint. Pipeline: Marker converts PDF to Markdown → simple parser splits Markdown into typed blocks → Groq llama-3.3-70b scores each block → FastAPI returns typed JSON. FastAPI auto-generates the OpenAPI spec the mobile app uses to codegen its types.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, Marker (`marker-pdf`), Groq Python SDK, Pydantic v2, python-dotenv, pytest, httpx

---

## File Map

| File | Responsibility |
|---|---|
| `backend/models.py` | Pydantic models — single source of truth for the API contract |
| `backend/extractor.py` | Run Marker on a PDF file path, parse output Markdown into `Block` list |
| `backend/verifier.py` | Send blocks to Groq in batches, attach confidence scores |
| `backend/main.py` | FastAPI app, `POST /extract` route, startup key validation, orchestration |
| `backend/requirements.txt` | Pinned Python dependencies |
| `backend/tests/conftest.py` | Shared fixtures: TestClient, sample PDF bytes |
| `backend/tests/test_models.py` | Unit tests for Pydantic model validation |
| `backend/tests/test_extractor.py` | Unit tests for Marker parsing (Marker mocked) |
| `backend/tests/test_verifier.py` | Unit tests for Groq verification (Groq SDK mocked) |
| `backend/tests/test_main.py` | Integration tests for `POST /extract` (extractor + verifier mocked) |

---

## Task 1: Set up backend project structure

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Create the backend directory**

```bash
mkdir backend && mkdir backend/tests
```

- [ ] **Step 2: Create `backend/requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
marker-pdf==0.3.10
groq==0.11.0
python-dotenv==1.0.1
pydantic>=2.0.0
python-multipart==0.0.12
httpx==0.27.2
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 3: Create a Python virtual environment and install dependencies**

Run from the `backend/` directory:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Note: Marker will download its ML models (~2GB) on first use. This happens automatically — allow several minutes on first run.

- [ ] **Step 4: Create `backend/tests/__init__.py`**

Empty file — makes `tests/` a Python package.

```python
```

- [ ] **Step 5: Create `backend/tests/conftest.py`**

```python
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        from main import app
        return TestClient(app)


@pytest.fixture
def sample_pdf_bytes():
    # Minimal valid single-page PDF
    return (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n"
        b"xref\n0 4\n"
        b"0000000000 65535 f\n"
        b"0000000009 00000 n\n"
        b"0000000058 00000 n\n"
        b"0000000115 00000 n\n"
        b"trailer\n<< /Size 4 /Root 1 0 R >>\n"
        b"startxref\n190\n%%EOF"
    )
```

- [ ] **Step 6: Verify pytest discovers tests**

```bash
cd backend
pytest tests/ --collect-only
```
Expected: "no tests ran" — the test files don't exist yet but pytest should exit cleanly with no import errors.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "chore: scaffold backend Python project structure"
```

---

## Task 2: Define Pydantic models (TDD)

**Files:**
- Create: `backend/models.py`
- Test: `backend/tests/test_models.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_models.py`:

```python
import pytest
from pydantic import ValidationError


def test_block_accepts_valid_types():
    from models import Block, BlockType
    for block_type in [BlockType.heading, BlockType.text, BlockType.table]:
        block = Block(type=block_type, content="Hello", page=1, confidence=0.9)
        assert block.type == block_type


def test_block_rejects_invalid_type():
    from models import Block
    with pytest.raises(ValidationError):
        Block(type="invalid", content="Hello", page=1, confidence=0.9)


def test_block_rejects_negative_page():
    from models import Block, BlockType
    with pytest.raises(ValidationError):
        Block(type=BlockType.text, content="Hello", page=-1, confidence=0.9)


def test_extraction_response_success():
    from models import ExtractionResponse, ExtractionStatus, Block, BlockType
    block = Block(type=BlockType.text, content="Hello", page=1, confidence=0.95)
    response = ExtractionResponse(
        book_id="abc-123",
        status=ExtractionStatus.success,
        overall_confidence=0.95,
        page_count=3,
        blocks=[block],
    )
    assert response.status == ExtractionStatus.success
    assert len(response.blocks) == 1


def test_extraction_response_serialises_to_dict():
    from models import ExtractionResponse, ExtractionStatus
    response = ExtractionResponse(
        book_id="abc-123",
        status=ExtractionStatus.failed,
        overall_confidence=0.0,
        page_count=1,
        blocks=[],
    )
    data = response.model_dump()
    assert data["status"] == "failed"
    assert data["blocks"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
pytest tests/test_models.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'models'`

- [ ] **Step 3: Implement `backend/models.py`**

```python
from enum import Enum
from pydantic import BaseModel, field_validator


class BlockType(str, Enum):
    heading = "heading"
    text = "text"
    table = "table"


class ExtractionStatus(str, Enum):
    success = "success"
    partial = "partial"
    failed = "failed"


class Block(BaseModel):
    type: BlockType
    content: str
    page: int
    confidence: float

    @field_validator("page")
    @classmethod
    def page_must_be_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("page must be >= 1")
        return v


class ExtractionResponse(BaseModel):
    book_id: str
    status: ExtractionStatus
    overall_confidence: float
    page_count: int
    blocks: list[Block]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
pytest tests/test_models.py -v
```
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/tests/test_models.py
git commit -m "feat: define Pydantic models for extraction API contract (TDD)"
```

---

## Task 3: Implement extractor (TDD)

**Files:**
- Create: `backend/extractor.py`
- Test: `backend/tests/test_extractor.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_extractor.py`:

```python
from unittest.mock import patch, MagicMock
from models import BlockType

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
    """Helper: patch Marker to return given markdown."""
    mock_meta = {"page_count": page_count}
    return patch("extractor.convert_single_pdf", return_value=(markdown, {}, mock_meta)), \
           patch("extractor.create_model_dict", return_value={})


def test_extract_returns_blocks_and_page_count():
    convert_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN, page_count=3)
    with convert_patch, models_patch:
        from extractor import extract
        blocks, page_count = extract("/fake/path.pdf")

    assert page_count == 3
    assert len(blocks) > 0


def test_extract_identifies_headings():
    convert_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with convert_patch, models_patch:
        from extractor import extract
        blocks, _ = extract("/fake/path.pdf")

    heading_blocks = [b for b in blocks if b.type == BlockType.heading]
    assert len(heading_blocks) >= 1
    assert any("Introduction" in b.content for b in heading_blocks)


def test_extract_identifies_text():
    convert_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with convert_patch, models_patch:
        from extractor import extract
        blocks, _ = extract("/fake/path.pdf")

    text_blocks = [b for b in blocks if b.type == BlockType.text]
    assert len(text_blocks) >= 1


def test_extract_identifies_tables():
    convert_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with convert_patch, models_patch:
        from extractor import extract
        blocks, _ = extract("/fake/path.pdf")

    table_blocks = [b for b in blocks if b.type == BlockType.table]
    assert len(table_blocks) == 1
    assert "Column A" in table_blocks[0].content


def test_extract_sets_confidence_to_zero():
    convert_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with convert_patch, models_patch:
        from extractor import extract
        blocks, _ = extract("/fake/path.pdf")

    assert all(b.confidence == 0.0 for b in blocks)


def test_extract_empty_pdf_returns_empty_blocks():
    convert_patch, models_patch = _mock_marker("", page_count=1)
    with convert_patch, models_patch:
        from extractor import extract
        blocks, page_count = extract("/fake/path.pdf")

    assert blocks == []
    assert page_count == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
pytest tests/test_extractor.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'extractor'`

- [ ] **Step 3: Implement `backend/extractor.py`**

```python
from marker.convert import convert_single_pdf
from marker.models import create_model_dict
from models import Block, BlockType

# Loaded once at module level to avoid reloading on every request
_model_dict: dict | None = None


def _get_models() -> dict:
    global _model_dict
    if _model_dict is None:
        _model_dict = create_model_dict()
    return _model_dict


def extract(file_path: str) -> tuple[list[Block], int]:
    """Run Marker on a PDF file and return parsed blocks + page count."""
    model_dict = _get_models()
    full_text, _images, out_meta = convert_single_pdf(file_path, model_dict)
    page_count = out_meta.get("page_count", 1)
    blocks = _parse_markdown(full_text, page_count)
    return blocks, page_count


def _parse_markdown(markdown: str, page_count: int) -> list[Block]:
    """Parse Marker's Markdown output into typed Block list."""
    blocks: list[Block] = []
    lines = markdown.split("\n")
    i = 0
    current_page = 1

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Heading
        if stripped.startswith("#"):
            content = stripped.lstrip("#").strip()
            if content:
                blocks.append(Block(type=BlockType.heading, content=content, page=current_page, confidence=0.0))
            i += 1

        # Table — collect all consecutive pipe-containing lines
        elif stripped.startswith("|"):
            table_lines: list[str] = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].rstrip())
                i += 1
            content = "\n".join(table_lines)
            blocks.append(Block(type=BlockType.table, content=content, page=current_page, confidence=0.0))

        # Empty line — skip
        elif not stripped:
            i += 1

        # Text paragraph — collect until blank line or heading
        else:
            para_lines: list[str] = []
            while i < len(lines):
                current = lines[i].strip()
                if not current or current.startswith("#") or current.startswith("|"):
                    break
                para_lines.append(current)
                i += 1
            content = " ".join(para_lines)
            if content:
                blocks.append(Block(type=BlockType.text, content=content, page=current_page, confidence=0.0))

    return blocks
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
pytest tests/test_extractor.py -v
```
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/extractor.py backend/tests/test_extractor.py
git commit -m "feat: implement PDF extractor with Marker and markdown parser (TDD)"
```

---

## Task 4: Implement verifier (TDD)

**Files:**
- Create: `backend/verifier.py`
- Test: `backend/tests/test_verifier.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_verifier.py`:

```python
import json
from unittest.mock import patch, MagicMock
from models import Block, BlockType


def make_block(content: str = "Test content", page: int = 1) -> Block:
    return Block(type=BlockType.text, content=content, page=page, confidence=0.0)


def mock_groq_response(scores: list[float]) -> MagicMock:
    mock = MagicMock()
    mock.choices[0].message.content = json.dumps({"scores": scores})
    return mock


def test_verify_attaches_confidence_scores():
    from verifier import verify
    blocks = [make_block("Block one"), make_block("Block two")]

    with patch("verifier.Groq") as MockGroq:
        MockGroq.return_value.chat.completions.create.return_value = mock_groq_response([0.92, 0.78])
        result = verify(blocks)

    assert result[0].confidence == 0.92
    assert result[1].confidence == 0.78


def test_verify_defaults_to_0_5_when_groq_raises():
    from verifier import verify
    blocks = [make_block("Some text")]

    with patch("verifier.Groq") as MockGroq:
        MockGroq.return_value.chat.completions.create.side_effect = Exception("API error")
        result = verify(blocks)

    assert result[0].confidence == 0.5


def test_verify_clamps_scores_above_1():
    from verifier import verify
    blocks = [make_block("Some text")]

    with patch("verifier.Groq") as MockGroq:
        MockGroq.return_value.chat.completions.create.return_value = mock_groq_response([1.5])
        result = verify(blocks)

    assert result[0].confidence == 1.0


def test_verify_clamps_scores_below_0():
    from verifier import verify
    blocks = [make_block("Some text")]

    with patch("verifier.Groq") as MockGroq:
        MockGroq.return_value.chat.completions.create.return_value = mock_groq_response([-0.2])
        result = verify(blocks)

    assert result[0].confidence == 0.0


def test_verify_processes_multiple_batches():
    from verifier import verify
    # BATCH_SIZE is 20; create 25 blocks to force two batches
    blocks = [make_block(f"Block {i}") for i in range(25)]

    call_count = 0

    def side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        # First batch: 20 blocks, second batch: 5 blocks
        n = 20 if call_count == 1 else 5
        return mock_groq_response([0.9] * n)

    with patch("verifier.Groq") as MockGroq:
        MockGroq.return_value.chat.completions.create.side_effect = side_effect
        result = verify(blocks)

    assert call_count == 2
    assert len(result) == 25
    assert all(b.confidence == 0.9 for b in result)


def test_verify_second_batch_fallback_does_not_affect_first():
    from verifier import verify
    blocks = [make_block(f"Block {i}") for i in range(25)]

    call_count = 0

    def side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return mock_groq_response([0.95] * 20)
        raise Exception("Second batch failed")

    with patch("verifier.Groq") as MockGroq:
        MockGroq.return_value.chat.completions.create.side_effect = side_effect
        result = verify(blocks)

    assert all(b.confidence == 0.95 for b in result[:20])
    assert all(b.confidence == 0.5 for b in result[20:])
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
pytest tests/test_verifier.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'verifier'`

- [ ] **Step 3: Implement `backend/verifier.py`**

```python
import json
import os
from groq import Groq
from models import Block

BATCH_SIZE = 20


def verify(blocks: list[Block]) -> list[Block]:
    """Score each block's confidence via Groq. Returns a new list with confidence set."""
    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    result = list(blocks)

    for i in range(0, len(blocks), BATCH_SIZE):
        batch = blocks[i : i + BATCH_SIZE]
        try:
            scores = _score_batch(client, batch)
            for j, score in enumerate(scores):
                result[i + j] = result[i + j].model_copy(update={"confidence": score})
        except Exception:
            for j in range(len(batch)):
                result[i + j] = result[i + j].model_copy(update={"confidence": 0.5})

    return result


def _score_batch(client: Groq, batch: list[Block]) -> list[float]:
    block_lines = "\n".join(
        f"{idx + 1}. [{b.type.value}] {b.content[:300]}"
        for idx, b in enumerate(batch)
    )

    prompt = (
        f"You are verifying text extracted from a PDF. For each block, assign a confidence "
        f"score from 0.0 to 1.0:\n"
        f"- 0.9–1.0: Coherent, complete, correctly extracted\n"
        f"- 0.7–0.89: Minor issues but readable\n"
        f"- 0.5–0.69: Some garbling or missing words\n"
        f"- 0.0–0.49: Severely garbled or incoherent\n\n"
        f"Return ONLY a JSON object: {{\"scores\": [...]}} with exactly {len(batch)} floats in order.\n\n"
        f"Blocks:\n{block_lines}"
    )

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )

    data = json.loads(response.choices[0].message.content)
    scores = data["scores"]

    if len(scores) != len(batch):
        raise ValueError(f"Expected {len(batch)} scores, got {len(scores)}")

    return [max(0.0, min(1.0, float(s))) for s in scores]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
pytest tests/test_verifier.py -v
```
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/verifier.py backend/tests/test_verifier.py
git commit -m "feat: implement Groq-based block verifier with confidence scoring (TDD)"
```

---

## Task 5: Implement FastAPI route (TDD)

**Files:**
- Create: `backend/main.py`
- Test: `backend/tests/test_main.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_main.py`:

```python
from unittest.mock import patch
from models import Block, BlockType, ExtractionStatus


def make_scored_block(confidence: float = 0.9) -> Block:
    return Block(type=BlockType.text, content="Test content", page=1, confidence=confidence)


def test_extract_returns_200_with_valid_pdf(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract, patch("main.verify") as mock_verify:
        mock_extract.return_value = ([make_scored_block(0.0)], 2)
        mock_verify.return_value = [make_scored_block(0.9)]

        response = client.post(
            "/extract",
            files={"pdf_file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )

    assert response.status_code == 200
    data = response.json()
    assert "book_id" in data
    assert len(data["book_id"]) == 36  # UUID length
    assert data["status"] == ExtractionStatus.success.value
    assert data["overall_confidence"] == 0.9
    assert data["page_count"] == 2
    assert len(data["blocks"]) == 1


def test_extract_status_is_partial_for_medium_confidence(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract, patch("main.verify") as mock_verify:
        mock_extract.return_value = ([make_scored_block(0.0)], 1)
        mock_verify.return_value = [make_scored_block(0.65)]

        response = client.post(
            "/extract",
            files={"pdf_file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )

    assert response.json()["status"] == ExtractionStatus.partial.value


def test_extract_status_is_failed_for_low_confidence(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract, patch("main.verify") as mock_verify:
        mock_extract.return_value = ([make_scored_block(0.0)], 1)
        mock_verify.return_value = [make_scored_block(0.3)]

        response = client.post(
            "/extract",
            files={"pdf_file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )

    assert response.json()["status"] == ExtractionStatus.failed.value


def test_extract_returns_failed_when_no_blocks_extracted(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract:
        mock_extract.return_value = ([], 1)

        response = client.post(
            "/extract",
            files={"pdf_file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )

    data = response.json()
    assert data["status"] == ExtractionStatus.failed.value
    assert data["overall_confidence"] == 0.0
    assert data["blocks"] == []


def test_extract_book_id_is_unique_per_request(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract, patch("main.verify") as mock_verify:
        mock_extract.return_value = ([make_scored_block(0.0)], 1)
        mock_verify.return_value = [make_scored_block(0.9)]

        r1 = client.post("/extract", files={"pdf_file": ("a.pdf", sample_pdf_bytes, "application/pdf")})
        r2 = client.post("/extract", files={"pdf_file": ("b.pdf", sample_pdf_bytes, "application/pdf")})

    assert r1.json()["book_id"] != r2.json()["book_id"]


def test_openapi_schema_is_reachable(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "paths" in response.json()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
pytest tests/test_main.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'main'`

- [ ] **Step 3: Implement `backend/main.py`**

```python
import os
import uuid
import tempfile
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File

load_dotenv("../.env.local")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError(
        "GROQ_API_KEY is not set. Add it to .env.local at the project root."
    )

from extractor import extract
from verifier import verify
from models import ExtractionResponse, ExtractionStatus

app = FastAPI(title="pdflow extraction API")


@app.post("/extract", response_model=ExtractionResponse)
async def extract_pdf(pdf_file: UploadFile = File(...)) -> ExtractionResponse:
    book_id = str(uuid.uuid4())

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        content = await pdf_file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        blocks, page_count = extract(tmp_path)

        if not blocks:
            return ExtractionResponse(
                book_id=book_id,
                status=ExtractionStatus.failed,
                overall_confidence=0.0,
                page_count=page_count,
                blocks=[],
            )

        scored_blocks = verify(blocks)
        overall_confidence = round(
            sum(b.confidence for b in scored_blocks) / len(scored_blocks), 3
        )

        if overall_confidence >= 0.8:
            status = ExtractionStatus.success
        elif overall_confidence >= 0.5:
            status = ExtractionStatus.partial
        else:
            status = ExtractionStatus.failed

        return ExtractionResponse(
            book_id=book_id,
            status=status,
            overall_confidence=overall_confidence,
            page_count=page_count,
            blocks=scored_blocks,
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
pytest tests/test_main.py -v
```
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Run the full test suite**

```bash
cd backend
pytest tests/ -v
```
Expected: PASS — 23 tests passing across 4 test files.

- [ ] **Step 6: Start the server and verify the OpenAPI spec is reachable**

```bash
cd backend
uvicorn main:app --reload
```

In a second terminal:
```bash
curl http://localhost:8000/openapi.json
```
Expected: JSON response containing `"paths"` with `/extract`.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/tests/test_main.py
git commit -m "feat: implement FastAPI POST /extract route with full pipeline (TDD)"
```

---

## Done

The backend is complete. The server exposes:
- `POST /extract` — accepts a PDF, returns confidence-scored blocks
- `GET /openapi.json` — the contract the mobile app uses to generate TypeScript types via `npm run generate:types`

Start the server for mobile development:
```bash
cd backend && source .venv/bin/activate && uvicorn main:app --reload
```
