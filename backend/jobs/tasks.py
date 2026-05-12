import logging
from pathlib import Path
from jobs.celery_app import celery_app
from pipeline.extractor import extract
from pipeline.verifier import verify

logger = logging.getLogger(__name__)


@celery_app.task
def process_pdf(job_id: str, file_path: str) -> dict:
    try:
        logger.info("Starting job %s for %s", job_id, file_path)

        if not Path(file_path).exists():
            logger.error("File not found: %s", file_path)
            return {
                "job_id": job_id,
                "status": "failed",
                "overall_confidence": 0.0,
                "page_count": 1,
                "blocks": [],
            }

        logger.info("Extracting %s", job_id)
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
        logger.info("Extracted %d blocks across %d pages for %s", len(blocks), page_count, job_id)

        if not blocks:
            logger.warning("No blocks extracted for %s", job_id)
            return {
                "job_id": job_id,
                "status": "failed",
                "overall_confidence": 0.0,
                "page_count": page_count,
                "blocks": [],
            }

        logger.info("Verifying %d blocks for %s", len(blocks), job_id)
        try:
            scored_blocks = verify(blocks)
        except Exception:
            logger.error("Verification failed for %s", job_id, exc_info=True)
            return {
                "job_id": job_id,
                "status": "failed",
                "overall_confidence": 0.0,
                "page_count": page_count,
                "blocks": [],
            }

        overall_confidence = round(
            sum(b.confidence for b in scored_blocks) / len(scored_blocks), 3
        )
        logger.info("Confidence %.3f for %s", overall_confidence, job_id)

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
