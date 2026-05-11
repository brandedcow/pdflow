import logging
import os
import uuid
import tempfile
import sys
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

# Ensure logs go to stdout and are visible in the terminal
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
    force=True
)
logger = logging.getLogger(__name__)

load_dotenv(Path(__file__).parent.parent / ".env.local")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError(
        "GROQ_API_KEY is not set. Add it to .env.local at the project root."
    )

from pipeline.extractor import extract
from pipeline.verifier import verify
from models import ExtractionResponse, ExtractionStatus

app = FastAPI(title="pdflow extraction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/extract", response_model=ExtractionResponse)
async def extract_pdf(pdf_file: UploadFile = File(...)) -> ExtractionResponse:
    book_id = str(uuid.uuid4())
    print(f"\n[DEBUG] Received request for {pdf_file.filename} (book_id: {book_id})")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        content = await pdf_file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    print(f"[DEBUG] Saved PDF to temp file: {tmp_path}")

    try:
        try:
            print(f"[DEBUG] Invoking marker extraction for {tmp_path}...")
            blocks, page_count = extract(tmp_path)
            print(f"[DEBUG] Extraction completed. Blocks: {len(blocks)}, Pages: {page_count}")
        except Exception as e:
            logger.error(f"Extraction CRASHED for {book_id}: {str(e)}", exc_info=True)
            print(f"[DEBUG] Extraction ERROR: {str(e)}")
            return ExtractionResponse(
                book_id=book_id,
                status=ExtractionStatus.failed,
                overall_confidence=0.0,
                page_count=1,
                blocks=[],
            )

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
