import pytest
from pathlib import Path
from unittest.mock import patch


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    monkeypatch.setattr("jobs.store._DB_PATH", tmp_path / "jobs.db")


def test_unknown_job_does_not_exist():
    from jobs.store import job_exists
    assert job_exists("nonexistent-id") is False


def test_job_exists_after_registration():
    from jobs.store import job_exists, register_job
    register_job("job-1")
    assert job_exists("job-1") is True


def test_get_status_queued_for_celery_pending():
    from jobs.store import get_job_status, register_job
    register_job("job-pending")
    with patch("jobs.store.AsyncResult") as MockResult:
        MockResult.return_value.state = "PENDING"
        result = get_job_status("job-pending")
    assert result == {"job_id": "job-pending", "status": "queued"}


def test_get_status_processing_for_celery_started():
    from jobs.store import get_job_status, register_job
    register_job("job-started")
    with patch("jobs.store.AsyncResult") as MockResult:
        MockResult.return_value.state = "STARTED"
        result = get_job_status("job-started")
    assert result["status"] == "processing"


def test_get_status_returns_task_result_on_success():
    from jobs.store import get_job_status, register_job
    register_job("job-done")
    expected = {
        "job_id": "job-done",
        "status": "success",
        "overall_confidence": 0.9,
        "page_count": 2,
        "blocks": [],
    }
    with patch("jobs.store.AsyncResult") as MockResult:
        MockResult.return_value.state = "SUCCESS"
        MockResult.return_value.get.return_value = expected
        result = get_job_status("job-done")
    assert result == expected


def test_get_status_returns_failed_on_celery_failure():
    from jobs.store import get_job_status, register_job
    register_job("job-failed")
    with patch("jobs.store.AsyncResult") as MockResult:
        MockResult.return_value.state = "FAILURE"
        result = get_job_status("job-failed")
    assert result["status"] == "failed"
    assert result["job_id"] == "job-failed"
