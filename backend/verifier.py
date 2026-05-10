import json
import os
from groq import Groq
from models import Block

BATCH_SIZE = 20


def verify(blocks: list[Block]) -> list[Block]:
    """Score each block's confidence via Groq. Returns a new list with confidence set."""
    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    result = list(blocks)

    for i in range(0, len(blocks), BATCH_SIZE):
        batch = blocks[i : i + BATCH_SIZE]
        try:
            scores = _score_batch(client, batch)
            for j, score in enumerate(scores):
                result[i + j] = result[i + j].model_copy(update={"confidence": score})
        except Exception:
            for j in range(len(batch)):
                result[i + j] = result[i + j].model_copy(update={"confidence": 0.5})

    return result


def _score_batch(client: Groq, batch: list[Block]) -> list[float]:
    block_lines = "\n".join(
        f"{idx + 1}. [{b.type.value}] {b.content[:300]}"
        for idx, b in enumerate(batch)
    )

    prompt = (
        f"You are verifying text extracted from a PDF. For each block, assign a confidence "
        f"score from 0.0 to 1.0:\n"
        f"- 0.9-1.0: Coherent, complete, correctly extracted\n"
        f"- 0.7-0.89: Minor issues but readable\n"
        f"- 0.5-0.69: Some garbling or missing words\n"
        f"- 0.0-0.49: Severely garbled or incoherent\n\n"
        f"Return ONLY a JSON object: {{\"scores\": [...]}} with exactly {len(batch)} floats in order.\n\n"
        f"Blocks:\n{block_lines}"
    )

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )

    data = json.loads(response.choices[0].message.content)
    scores = data["scores"]

    if len(scores) != len(batch):
        raise ValueError(f"Expected {len(batch)} scores, got {len(scores)}")

    return [max(0.0, min(1.0, float(s))) for s in scores]
