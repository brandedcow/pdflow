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


def test_extraction_response_success():
    from models import ExtractionResponse, ExtractionStatus, Block, BlockType
    block = Block(type=BlockType.text, content="Hello", page=1, confidence=0.95)
    response = ExtractionResponse(
        book_id="abc-123",
        status=ExtractionStatus.success,
        overall_confidence=0.95,
        page_count=3,
        blocks=[block],
    )
    assert response.status == ExtractionStatus.success
    assert len(response.blocks) == 1


def test_extraction_response_serialises_to_dict():
    from models import ExtractionResponse, ExtractionStatus
    response = ExtractionResponse(
        book_id="abc-123",
        status=ExtractionStatus.failed,
        overall_confidence=0.0,
        page_count=1,
        blocks=[],
    )
    data = response.model_dump()
    assert data["status"] == "failed"
    assert data["blocks"] == []
