from unittest.mock import MagicMock, patch
from models import BlockType


def teardown_function():
    import pipeline.extractor
    pipeline.extractor._model_list = None


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
    mock_rendered = MagicMock()
    mock_rendered.markdown = markdown

    mock_instance = MagicMock()
    mock_instance.return_value = mock_rendered
    mock_instance.page_count = page_count

    return (
        patch("pipeline.extractor.PdfConverter", return_value=mock_instance),
        patch("pipeline.extractor.create_model_dict", return_value={}),
    )


def test_extract_returns_blocks_and_page_count():
    converter_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN, page_count=3)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        blocks, page_count = extract("/fake/path.pdf")
    assert page_count == 3
    assert len(blocks) > 0


def test_extract_identifies_headings():
    converter_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        blocks, _ = extract("/fake/path.pdf")
    heading_blocks = [b for b in blocks if b.type == BlockType.heading]
    assert len(heading_blocks) >= 1
    assert any("Introduction" in b.content for b in heading_blocks)


def test_extract_identifies_text():
    converter_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        blocks, _ = extract("/fake/path.pdf")
    assert any(b.type == BlockType.text for b in blocks)


def test_extract_identifies_tables():
    converter_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        blocks, _ = extract("/fake/path.pdf")
    table_blocks = [b for b in blocks if b.type == BlockType.table]
    assert len(table_blocks) == 1
    assert "Column A" in table_blocks[0].content


def test_extract_sets_confidence_to_zero():
    converter_patch, models_patch = _mock_marker(SAMPLE_MARKDOWN)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        blocks, _ = extract("/fake/path.pdf")
    assert all(b.confidence == 0.0 for b in blocks)


def test_extract_empty_pdf_returns_empty_blocks():
    converter_patch, models_patch = _mock_marker("", page_count=1)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        blocks, page_count = extract("/fake/path.pdf")
    assert blocks == []
    assert page_count == 1


def test_extract_uses_page_count_from_converter():
    converter_patch, models_patch = _mock_marker("# Title", page_count=1)
    with converter_patch, models_patch:
        from pipeline.extractor import extract
        _, page_count = extract("/fake/path.pdf")
    assert page_count == 1
