import sqlite3
from pathlib import Path
from celery.result import AsyncResult
from jobs.celery_app import celery_app

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
        try:
            return result.get()
        except Exception:
            return {
                "job_id": job_id,
                "status": "failed",
                "overall_confidence": 0.0,
                "page_count": 1,
                "blocks": [],
            }
    else:
        return {
            "job_id": job_id,
            "status": "failed",
            "overall_confidence": 0.0,
            "page_count": 1,
            "blocks": [],
        }
