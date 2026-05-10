# pdflow extraction backend

Python FastAPI service for PDF text extraction.

## Setup

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

Note: `marker-pdf` downloads ~2GB of ML models on first use.

## Run

```bash
cd backend
.venv\Scripts\activate   # or source .venv/bin/activate
uvicorn main:app --reload
```

Server starts at `http://localhost:8000`. The `.env.local` file at the project root must contain:
```
GROQ_API_KEY=your_key_here
```

## Test

All tests must be run from within the venv:
```bash
cd backend
.venv\Scripts\activate
pytest tests/ -v
```
