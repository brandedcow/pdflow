from typing import Any

from marker.convert import convert_single_pdf
from marker.models import load_all_models as create_model_dict
from models import Block, BlockType

# Loaded once at module level to avoid reloading on every request
_model_list: list[Any] | None = None


def _get_models() -> list:
    global _model_list
    if _model_list is None:
        _model_list = create_model_dict()
    return _model_list


def extract(file_path: str) -> tuple[list[Block], int]:
    """Run Marker on a PDF file and return parsed blocks + page count.

    Thread-safety note: _get_models() uses a simple global singleton.
    This will be replaced with a FastAPI lifespan startup event in main.py
    to ensure models are loaded once before any requests are served.
    """
    model_dict = _get_models()
    full_text, _images, out_meta = convert_single_pdf(file_path, model_dict)
    page_count = out_meta.get("page_count", 1)
    blocks = _parse_markdown(full_text)
    return blocks, page_count


def _parse_markdown(markdown: str) -> list[Block]:
    """Parse Marker's Markdown output into typed Block list.

    Note: page attribution is not available from Marker's plain Markdown output.
    All blocks are assigned page=1. This is a known v1 limitation.
    """
    blocks: list[Block] = []
    lines = markdown.split("\n")
    i = 0
    current_page = 1

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Heading
        if stripped.startswith("#"):
            content = stripped.lstrip("#").strip()
            if content:
                blocks.append(Block(type=BlockType.heading, content=content, page=current_page, confidence=0.0))
            i += 1

        # Table — collect all consecutive pipe-containing lines
        elif stripped.startswith("|"):
            table_lines: list[str] = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].rstrip())
                i += 1
            content = "\n".join(table_lines)
            blocks.append(Block(type=BlockType.table, content=content, page=current_page, confidence=0.0))

        # Empty line — skip
        elif not stripped:
            i += 1

        # Text paragraph — collect until blank line or heading
        else:
            para_lines: list[str] = []
            while i < len(lines):
                current = lines[i].strip()
                if not current or current.startswith("#") or current.startswith("|"):
                    break
                para_lines.append(current)
                i += 1
            content = " ".join(para_lines)
            if content:
                blocks.append(Block(type=BlockType.text, content=content, page=current_page, confidence=0.0))

    return blocks
