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
