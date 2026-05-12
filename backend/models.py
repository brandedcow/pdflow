from enum import Enum
from typing import Literal
from pydantic import BaseModel, field_validator


class BlockType(str, Enum):
    heading = "heading"
    text = "text"
    table = "table"


class ExtractionStatus(str, Enum):
    success = "success"
    partial = "partial"
    failed = "failed"


class JobStatus(str, Enum):
    queued = "queued"
    processing = "processing"
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

    @field_validator("confidence")
    @classmethod
    def confidence_must_be_valid(cls, v: float) -> float:
        if not (0.0 <= v <= 1.0):
            raise ValueError("confidence must be between 0.0 and 1.0")
        return v


class JobSubmitResponse(BaseModel):
    job_id: str
    status: Literal["queued"]


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    overall_confidence: float | None = None
    page_count: int | None = None
    blocks: list[Block] | None = None
