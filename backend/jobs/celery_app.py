from pathlib import Path
from celery import Celery
from dotenv import load_dotenv

_BASE_DIR = Path(__file__).parent.parent
load_dotenv(_BASE_DIR.parent / ".env.local")
_DATA_DIR = _BASE_DIR / "data"
_DATA_DIR.mkdir(parents=True, exist_ok=True)  # idempotent; safe for single-worker local dev

celery_app = Celery(
    "pdflow",
    broker=f"sqla+sqlite:///{_DATA_DIR}/celery.db",
    backend=f"db+sqlite:///{_DATA_DIR}/results.db",
    include=["jobs.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    broker_connection_retry_on_startup=True,
)
