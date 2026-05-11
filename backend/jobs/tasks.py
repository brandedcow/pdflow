import logging
from pathlib import Path
from jobs.celery_app import celery_app
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
