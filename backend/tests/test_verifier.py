import json
import os
from unittest.mock import patch, MagicMock
from models import Block, BlockType


def make_block(content: str = "Test content", page: int = 1) -> Block:
    return Block(type=BlockType.text, content=content, page=page, confidence=0.0)


def mock_groq_response(scores: list[float]) -> MagicMock:
    mock = MagicMock()
    mock.choices[0].message.content = json.dumps({"scores": scores})
    return mock


def test_verify_attaches_confidence_scores():
    from verifier import verify
    blocks = [make_block("Block one"), make_block("Block two")]

    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        with patch("verifier.Groq") as MockGroq:
            MockGroq.return_value.chat.completions.create.return_value = mock_groq_response([0.92, 0.78])
            result = verify(blocks)

    assert result[0].confidence == 0.92
    assert result[1].confidence == 0.78


def test_verify_defaults_to_0_5_when_groq_raises():
    from verifier import verify
    blocks = [make_block("Some text")]

    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        with patch("verifier.Groq") as MockGroq:
            MockGroq.return_value.chat.completions.create.side_effect = Exception("API error")
            result = verify(blocks)

    assert result[0].confidence == 0.5


def test_verify_clamps_scores_above_1():
    from verifier import verify
    blocks = [make_block("Some text")]

    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        with patch("verifier.Groq") as MockGroq:
            MockGroq.return_value.chat.completions.create.return_value = mock_groq_response([1.5])
            result = verify(blocks)

    assert result[0].confidence == 1.0


def test_verify_clamps_scores_below_0():
    from verifier import verify
    blocks = [make_block("Some text")]

    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        with patch("verifier.Groq") as MockGroq:
            MockGroq.return_value.chat.completions.create.return_value = mock_groq_response([-0.2])
            result = verify(blocks)

    assert result[0].confidence == 0.0


def test_verify_processes_multiple_batches():
    from verifier import verify
    # BATCH_SIZE is 20; create 25 blocks to force two batches
    blocks = [make_block(f"Block {i}") for i in range(25)]

    call_count = 0

    def side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        # First batch: 20 blocks, second batch: 5 blocks
        n = 20 if call_count == 1 else 5
        return mock_groq_response([0.9] * n)

    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        with patch("verifier.Groq") as MockGroq:
            MockGroq.return_value.chat.completions.create.side_effect = side_effect
            result = verify(blocks)

    assert call_count == 2
    assert len(result) == 25
    assert all(b.confidence == 0.9 for b in result)


def test_verify_second_batch_fallback_does_not_affect_first():
    from verifier import verify
    blocks = [make_block(f"Block {i}") for i in range(25)]

    call_count = 0

    def side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return mock_groq_response([0.95] * 20)
        raise Exception("Second batch failed")

    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
        with patch("verifier.Groq") as MockGroq:
            MockGroq.return_value.chat.completions.create.side_effect = side_effect
            result = verify(blocks)

    assert all(b.confidence == 0.95 for b in result[:20])
    assert all(b.confidence == 0.5 for b in result[20:])
