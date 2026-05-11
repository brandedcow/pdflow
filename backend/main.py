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
from jobs.store import get_job_status, job_exists, register_job
from jobs.tasks import process_pdf


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
