import json
from pathlib import Path
from unittest.mock import MagicMock, patch
from models import Block, BlockType


def _make_block(confidence: float = 0.9) -> Block:
    return Block(type=BlockType.text, content="Test content", page=1, confidence=confidence)


def test_process_pdf_returns_success_for_high_confidence(sample_pdf_file):
    from jobs.tasks import process_pdf
    with patch("jobs.tasks.extract") as mock_extract, \
         patch("jobs.tasks.verify") as mock_verify:
        mock_extract.return_value = ([_make_block(0.0)], 2)
        mock_verify.return_value = [_make_block(0.9)]
        result = process_pdf("job-1", sample_pdf_file)
    assert result["status"] == "success"
    assert result["job_id"] == "job-1"
    assert result["overall_confidence"] == 0.9
    assert result["page_count"] == 2
    assert len(result["blocks"]) == 1


def test_process_pdf_returns_partial_for_medium_confidence(sample_pdf_file):
    from jobs.tasks import process_pdf
    with patch("jobs.tasks.extract") as mock_extract, \
         patch("jobs.tasks.verify") as mock_verify:
        mock_extract.return_value = ([_make_block(0.0)], 1)
        mock_verify.return_value = [_make_block(0.65)]
        result = process_pdf("job-2", sample_pdf_file)
    assert result["status"] == "partial"


def test_process_pdf_returns_failed_for_low_confidence(sample_pdf_file):
    from jobs.tasks import process_pdf
    with patch("jobs.tasks.extract") as mock_extract, \
         patch("jobs.tasks.verify") as mock_verify:
        mock_extract.return_value = ([_make_block(0.0)], 1)
        mock_verify.return_value = [_make_block(0.3)]
        result = process_pdf("job-3", sample_pdf_file)
    assert result["status"] == "failed"


def test_process_pdf_returns_failed_when_no_blocks(sample_pdf_file):
    from jobs.tasks import process_pdf
    with patch("jobs.tasks.extract") as mock_extract:
        mock_extract.return_value = ([], 1)
        result = process_pdf("job-4", sample_pdf_file)
    assert result["status"] == "failed"
    assert result["blocks"] == []


def test_process_pdf_returns_failed_when_extraction_raises(sample_pdf_file):
    from jobs.tasks import process_pdf
    with patch("jobs.tasks.extract") as mock_extract:
        mock_extract.side_effect = Exception("Marker crashed")
        result = process_pdf("job-5", sample_pdf_file)
    assert result["status"] == "failed"


def test_process_pdf_deletes_file_on_success(sample_pdf_file):
    from jobs.tasks import process_pdf
    with patch("jobs.tasks.extract") as mock_extract, \
         patch("jobs.tasks.verify") as mock_verify:
        mock_extract.return_value = ([_make_block(0.0)], 1)
        mock_verify.return_value = [_make_block(0.9)]
        process_pdf("job-6", sample_pdf_file)
    assert not Path(sample_pdf_file).exists()


def test_process_pdf_deletes_file_on_failure(tmp_path, sample_pdf_bytes):
    from jobs.tasks import process_pdf
    pdf = tmp_path / "fail.pdf"
    pdf.write_bytes(sample_pdf_bytes)
    with patch("jobs.tasks.extract") as mock_extract:
        mock_extract.side_effect = Exception("crash")
        process_pdf("job-7", str(pdf))
    assert not pdf.exists()


def test_process_pdf_returns_failed_for_missing_file():
    from jobs.tasks import process_pdf
    result = process_pdf("job-8", "/nonexistent/path.pdf")
    assert result["status"] == "failed"
    assert result["blocks"] == []


def test_process_pdf_result_is_json_serializable(sample_pdf_file):
    from jobs.tasks import process_pdf
    with patch("jobs.tasks.extract") as mock_extract, \
         patch("jobs.tasks.verify") as mock_verify:
        mock_extract.return_value = ([_make_block(0.0)], 1)
        mock_verify.return_value = [_make_block(0.9)]
        result = process_pdf("job-9", sample_pdf_file)
    json.dumps(result)  # Celery serialises the return value to JSON
