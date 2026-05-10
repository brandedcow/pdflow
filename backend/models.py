from enum import Enum
from pydantic import BaseModel, field_validator


class BlockType(str, Enum):
    heading = "heading"
    text = "text"
    table = "table"


class ExtractionStatus(str, Enum):
    success = "success"
    partial = "partial"
    failed = "failed"


class Block(BaseModel):
    type: BlockType
    content: str
    page: int
    confidence: float

    @field_validator("page")
    @classmethod
    def page_must_be_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("page must be >= 1")
        return v


class ExtractionResponse(BaseModel):
    book_id: str
    status: ExtractionStatus
    overall_confidence: float
    page_count: int
    blocks: list[Block]
