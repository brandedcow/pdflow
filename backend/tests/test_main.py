from unittest.mock import patch
from models import Block, BlockType, ExtractionStatus


def make_scored_block(confidence: float = 0.9) -> Block:
    return Block(type=BlockType.text, content="Test content", page=1, confidence=confidence)


def test_extract_returns_200_with_valid_pdf(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract, patch("main.verify") as mock_verify:
        mock_extract.return_value = ([make_scored_block(0.0)], 2)
        mock_verify.return_value = [make_scored_block(0.9)]

        response = client.post(
            "/extract",
            files={"pdf_file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )

    assert response.status_code == 200
    data = response.json()
    assert "book_id" in data
    assert len(data["book_id"]) == 36  # UUID length
    assert data["status"] == ExtractionStatus.success.value
    assert data["overall_confidence"] == 0.9
    assert data["page_count"] == 2
    assert len(data["blocks"]) == 1


def test_extract_status_is_partial_for_medium_confidence(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract, patch("main.verify") as mock_verify:
        mock_extract.return_value = ([make_scored_block(0.0)], 1)
        mock_verify.return_value = [make_scored_block(0.65)]

        response = client.post(
            "/extract",
            files={"pdf_file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )

    assert response.json()["status"] == ExtractionStatus.partial.value


def test_extract_status_is_failed_for_low_confidence(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract, patch("main.verify") as mock_verify:
        mock_extract.return_value = ([make_scored_block(0.0)], 1)
        mock_verify.return_value = [make_scored_block(0.3)]

        response = client.post(
            "/extract",
            files={"pdf_file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )

    assert response.json()["status"] == ExtractionStatus.failed.value


def test_extract_returns_failed_when_no_blocks_extracted(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract:
        mock_extract.return_value = ([], 1)

        response = client.post(
            "/extract",
            files={"pdf_file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )

    data = response.json()
    assert data["status"] == ExtractionStatus.failed.value
    assert data["overall_confidence"] == 0.0
    assert data["blocks"] == []


def test_extract_book_id_is_unique_per_request(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract, patch("main.verify") as mock_verify:
        mock_extract.return_value = ([make_scored_block(0.0)], 1)
        mock_verify.return_value = [make_scored_block(0.9)]

        r1 = client.post("/extract", files={"pdf_file": ("a.pdf", sample_pdf_bytes, "application/pdf")})
        r2 = client.post("/extract", files={"pdf_file": ("b.pdf", sample_pdf_bytes, "application/pdf")})

    assert r1.json()["book_id"] != r2.json()["book_id"]


def test_openapi_schema_is_reachable(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "paths" in response.json()


def test_extract_status_boundary_exactly_0_8_is_success(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract, patch("main.verify") as mock_verify:
        mock_extract.return_value = ([make_scored_block(0.0)], 1)
        mock_verify.return_value = [make_scored_block(0.8)]
        response = client.post(
            "/extract",
            files={"pdf_file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )
    assert response.json()["status"] == ExtractionStatus.success.value


def test_extract_status_boundary_exactly_0_5_is_partial(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract, patch("main.verify") as mock_verify:
        mock_extract.return_value = ([make_scored_block(0.0)], 1)
        mock_verify.return_value = [make_scored_block(0.5)]
        response = client.post(
            "/extract",
            files={"pdf_file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )
    assert response.json()["status"] == ExtractionStatus.partial.value


def test_extract_status_boundary_below_0_5_is_failed(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract, patch("main.verify") as mock_verify:
        mock_extract.return_value = ([make_scored_block(0.0)], 1)
        mock_verify.return_value = [make_scored_block(0.499)]
        response = client.post(
            "/extract",
            files={"pdf_file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )
    assert response.json()["status"] == ExtractionStatus.failed.value


def test_extract_returns_failed_when_extraction_raises(client, sample_pdf_bytes):
    with patch("main.extract") as mock_extract:
        mock_extract.side_effect = Exception("Marker crashed")
        response = client.post(
            "/extract",
            files={"pdf_file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
        )
    assert response.status_code == 200
    assert response.json()["status"] == ExtractionStatus.failed.value
