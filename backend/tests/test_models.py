import pytest
from pydantic import ValidationError


def test_block_accepts_valid_types():
    from models import Block, BlockType
    for block_type in [BlockType.heading, BlockType.text, BlockType.table]:
        block = Block(type=block_type, content="Hello", page=1, confidence=0.9)
        assert block.type == block_type


def test_block_rejects_invalid_type():
    from models import Block
    with pytest.raises(ValidationError):
        Block(type="invalid", content="Hello", page=1, confidence=0.9)


def test_block_rejects_negative_page():
    from models import Block, BlockType
    with pytest.raises(ValidationError):
        Block(type=BlockType.text, content="Hello", page=-1, confidence=0.9)


def test_block_rejects_confidence_above_1():
    from models import Block, BlockType
    with pytest.raises(ValidationError):
        Block(type=BlockType.text, content="Hello", page=1, confidence=1.5)


def test_block_rejects_negative_confidence():
    from models import Block, BlockType
    with pytest.raises(ValidationError):
        Block(type=BlockType.text, content="Hello", page=1, confidence=-0.1)


def test_job_submit_response_shape():
    from models import JobSubmitResponse
    r = JobSubmitResponse(job_id="abc-123", status="queued")
    assert r.job_id == "abc-123"
    assert r.status == "queued"


def test_job_status_response_processing_has_no_result_fields():
    from models import JobStatus, JobStatusResponse
    r = JobStatusResponse(job_id="abc-123", status=JobStatus.processing)
    assert r.status == JobStatus.processing
    assert r.overall_confidence is None
    assert r.blocks is None
    assert r.page_count is None


def test_job_status_response_success_with_result():
    from models import Block, BlockType, JobStatus, JobStatusResponse
    block = Block(type=BlockType.text, content="Hello", page=1, confidence=0.9)
    r = JobStatusResponse(
        job_id="abc-123",
        status=JobStatus.success,
        overall_confidence=0.9,
        page_count=3,
        blocks=[block],
    )
    assert r.overall_confidence == 0.9
    assert len(r.blocks) == 1
