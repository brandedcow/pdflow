import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    import sys
    sys.modules.pop("main", None)
    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        from main import app
        yield TestClient(app)
    sys.modules.pop("main", None)


@pytest.fixture
def sample_pdf_bytes():
    # Minimal PDF bytes used only for multipart upload testing.
    # The xref offsets are approximate — this file is never parsed by a real
    # PDF reader in tests because extract() is always mocked.
    return (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n"
        b"xref\n0 4\n"
        b"0000000000 65535 f\n"
        b"0000000009 00000 n\n"
        b"0000000058 00000 n\n"
        b"0000000115 00000 n\n"
        b"trailer\n<< /Size 4 /Root 1 0 R >>\n"
        b"startxref\n190\n%%EOF"
    )
