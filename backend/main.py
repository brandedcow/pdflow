import os
import uuid
import tempfile
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File

load_dotenv(Path(__file__).parent.parent / ".env.local")

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
