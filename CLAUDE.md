# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

pdflow is a two-system project:

1. **Mobile app** — React Native (Expo) PDF reader for iOS and Android. Device-only storage, continuous scroll, no annotations.
2. **Backend** — Python FastAPI service for LLM-assisted PDF text extraction. Runs locally at `http://localhost:8000`.

## Mobile App Commands

```bash
# Start dev server (requires custom dev client — Expo Go will not work)
npm start

# Run tests
npx jest --no-coverage

# Run a single test file
npx jest __tests__/LibraryContext.test.tsx --no-coverage

# Type check
npx tsc --noEmit

# Lint
npx eslint src/ app/

# Build custom dev client for iOS (required for react-native-pdf)
npm run build:dev
# or directly: eas build --profile development --platform ios
```

**Note:** `react-native-pdf` uses native code not available in Expo Go. A custom dev client must be built via EAS and installed on the device/simulator before development testing.

## Backend Commands

All backend commands must run from within the venv:

```bash
cd backend
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

# Start server
uvicorn main:app --reload

# Run tests
pytest tests/ -v

# Run a single test file
pytest tests/test_verifier.py -v

# Run a single test
pytest tests/test_main.py::test_extract_returns_200_with_valid_pdf -v
```

**Prerequisite:** `.env.local` at the project root must contain `GROQ_API_KEY=your_key_here`.

## Architecture

### Mobile Layer Boundaries

```
app/_layout.tsx         — Expo Router root; wraps tree with SafeAreaProvider + LibraryProvider
app/index.tsx           — LibraryScreen (book list, import FAB)
app/reader.tsx          — ReaderScreen (thin route; reads params, renders ReaderContainer)
src/context/LibraryContext.tsx  — Single source of truth for books[]; owns importBook()
src/storage/storage.ts  — Pure AsyncStorage I/O: loadBooks, saveBook, replaceBook
src/hooks/useLibrary.ts — Context consumer hook; throws if used outside LibraryProvider
src/types/index.ts      — Book type (id, filename, path, addedAt, extractionStatus, extractionResult)
```

**Key data flows:**
- `importBook()` copies the PDF to `<documentDirectory>/pdfs/<uuid>-<filename>`, persists metadata to AsyncStorage, then POSTs to the backend. The book is added to state immediately with `extractionStatus: 'pending'`, then updated to `'ready'` or `'failed'` when the backend responds.
- `Book.id` comes from the backend's returned `book_id`, not from the mobile app. The preliminary UUID used during the `pending` phase is replaced after extraction completes.
- `expo-file-system/legacy` is the import path for the legacy procedural API (`documentDirectory`, `copyAsync`, `moveAsync`). The main `expo-file-system` export uses a new OO API and does not expose these.

### Backend Layer Boundaries

```
backend/models.py     — Pydantic models; single source of truth for the API contract
backend/extractor.py  — Marker integration; lazy singleton for model loading; markdown parser
backend/verifier.py   — Groq batch scoring (BATCH_SIZE=20); falls back to 0.5 on error
backend/main.py       — FastAPI app; orchestrates extract→verify→status classification
```

**Key behaviours:**
- `models.py` is the authoritative API contract. FastAPI auto-generates `/openapi.json` from it. The mobile app regenerates its TypeScript types from this spec via `npm run generate:types` (requires backend running).
- Status thresholds: `overall_confidence >= 0.8` → `success`, `>= 0.5` → `partial`, `< 0.5` → `failed`.
- Marker's model singleton (`_model_list`) is intentionally not thread-safe — it's a known v1 limitation documented in `extractor.py`. Move to a FastAPI `lifespan` startup event before adding concurrency.
- All blocks start with `confidence=0.0` from the extractor; the verifier populates real scores.
- Page attribution is not available from Marker's Markdown output — all blocks are assigned `page=1` (known limitation).

### TypeScript Type Generation

When the backend contract changes, regenerate the mobile types:

```bash
# Backend must be running first
npm run generate:types
```

This hits `http://localhost:8000/openapi.json` and writes `src/types/generated.ts`. Commit the result.

## Testing Patterns

**Mobile:** Tests mock `expo-file-system/legacy`, `expo-document-picker`, `expo-crypto`, and `@react-native-async-storage/async-storage`. Use `jest.mock('../src/api/extractionApi')` when testing `LibraryContext` — the API client is always mocked in unit tests.

**Backend:** Tests mock `extractor.convert_single_pdf` and `extractor.create_model_dict` at the `extractor` module level (not at the source). Groq is mocked via `patch("verifier.Groq")`. The `client` fixture in `conftest.py` pops `main` from `sys.modules` before each test to force a clean import while the `GROQ_API_KEY` mock is active.

## Dependency Notes

- `legacy-peer-deps=true` is set in `.npmrc` — required due to `react@19.1.0` vs peer dep expectations. Do not remove it.
- `marker-pdf` downloads ~2GB of ML models on first use. These are cached after the initial download.
- The Python venv uses Python 3.14 with a Pillow workaround (`pip check` reports warnings — acceptable, runtime behaviour is unaffected).
