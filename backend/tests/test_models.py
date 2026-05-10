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


def test_block_rejects_confidence_above_1():
    from models import Block, BlockType
    with pytest.raises(ValidationError):
        Block(type=BlockType.text, content="Hello", page=1, confidence=1.5)


def test_block_rejects_negative_confidence():
    from models import Block, BlockType
    with pytest.raises(ValidationError):
        Block(type=BlockType.text, content="Hello", page=1, confidence=-0.1)


def test_extraction_response_rejects_invalid_overall_confidence():
    from models import ExtractionResponse, ExtractionStatus
    with pytest.raises(ValidationError):
        ExtractionResponse(
            book_id="abc-123",
            status=ExtractionStatus.success,
            overall_confidence=1.5,
            page_count=1,
            blocks=[],
        )


def test_extraction_response_rejects_zero_page_count():
    from models import ExtractionResponse, ExtractionStatus
    with pytest.raises(ValidationError):
        ExtractionResponse(
            book_id="abc-123",
            status=ExtractionStatus.success,
            overall_confidence=0.9,
            page_count=0,
            blocks=[],
        )


def test_extraction_response_serialises_enums_to_strings():
    import json
    from models import ExtractionResponse, ExtractionStatus, Block, BlockType
    block = Block(type=BlockType.text, content="Hello", page=1, confidence=0.9)
    response = ExtractionResponse(
        book_id="abc-123",
        status=ExtractionStatus.success,
        overall_confidence=0.9,
        page_count=1,
        blocks=[block],
    )
    parsed = json.loads(response.model_dump_json())
    assert parsed["status"] == "success"
    assert parsed["blocks"][0]["type"] == "text"
