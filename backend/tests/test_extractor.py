from unittest.mock import patch
from models import BlockType


def teardown_function():
    import sys
    mod = sys.modules.get("extractor")
    if mod is not None:
        mod._model_list = None

SAMPLE_MARKDOWN = """\
# Introduction

This is a paragraph with some body text that should become a text block.

## Methods

A second paragraph under a subheading.

| Column A | Column B |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
"""


def _mock_marker(markdown: str, page_count: int = 2):
    """Helper: patch Marker to return given markdown."""
    mock_meta = {"page_count": page_count}
    return patch("extractor.convert_single_pdf", return_value=(markdown, {}, mock_meta)), \
           patch("extractor.create_model_dict", return_value={})


def test_extract_returns_blocks_and_page_count():
    convert_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN, page_count=3)
    with convert_patch, models_patch:
        from extractor import extract
        blocks, page_count = extract("/fake/path.pdf")

    assert page_count == 3
    assert len(blocks) > 0


def test_extract_identifies_headings():
    convert_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with convert_patch, models_patch:
        from extractor import extract
        blocks, _ = extract("/fake/path.pdf")

    heading_blocks = [b for b in blocks if b.type == BlockType.heading]
    assert len(heading_blocks) >= 1
    assert any("Introduction" in b.content for b in heading_blocks)


def test_extract_identifies_text():
    convert_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with convert_patch, models_patch:
        from extractor import extract
        blocks, _ = extract("/fake/path.pdf")

    text_blocks = [b for b in blocks if b.type == BlockType.text]
    assert len(text_blocks) >= 1


def test_extract_identifies_tables():
    convert_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with convert_patch, models_patch:
        from extractor import extract
        blocks, _ = extract("/fake/path.pdf")

    table_blocks = [b for b in blocks if b.type == BlockType.table]
    assert len(table_blocks) == 1
    assert "Column A" in table_blocks[0].content


def test_extract_sets_confidence_to_zero():
    convert_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with convert_patch, models_patch:
        from extractor import extract
        blocks, _ = extract("/fake/path.pdf")

    assert all(b.confidence == 0.0 for b in blocks)


def test_extract_empty_pdf_returns_empty_blocks():
    convert_patch, models_patch = _mock_marker("", page_count=1)
    with convert_patch, models_patch:
        from extractor import extract
        blocks, page_count = extract("/fake/path.pdf")

    assert blocks == []
    assert page_count == 1


def test_extract_uses_default_page_count_when_metadata_missing():
    with patch("extractor.convert_single_pdf", return_value=("# Title", {}, {})), \
         patch("extractor.create_model_dict", return_value={}):
        from extractor import extract
        _, page_count = extract("/fake/path.pdf")
    assert page_count == 1
