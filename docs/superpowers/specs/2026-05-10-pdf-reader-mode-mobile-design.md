# PDF Reader Mode — Mobile Design Spec
**Date:** 2026-05-10
**Status:** Approved

## Overview

Adds a Kindle-like reader mode to the pdflow mobile app. When a PDF is imported, it is sent to the local extraction backend for processing. The extracted, confidence-scored text is stored on-device and becomes the default reading view. If extraction fails or the backend is unavailable, the app falls back gracefully to the existing native PDF viewer. Users can adjust font size and background colour in the reader view.

**Depends on:** `2026-05-10-pdf-extraction-backend-design.md` — the backend must be running for extraction to succeed.

---

## Stack additions

| Concern | Choice |
|---|---|
| Type generation | `openapi-typescript` — codegens `src/types/generated.ts` from backend's `/openapi.json` |
| Type gen script | `npm run generate:types` (hits `http://localhost:8000/openapi.json`) |
| Markdown table rendering | `react-native-markdown-display` |

---

## File Structure

**New files:**
```
src/
├── api/
│   └── extractionApi.ts          # POST /extract HTTP client
├── components/
│   └── reader/
│       ├── ReaderContainer.tsx   # status routing, banners
│       ├── NativePdfViewer.tsx   # wraps react-native-pdf
│       ├── ExtractedReader.tsx   # extracted view + settings
│       ├── BlockRenderer.tsx     # heading / text / table block
│       ├── ConfidenceBadge.tsx   # overall + per-block confidence UI
│       └── ReaderSettings.tsx    # font size + background controls
└── types/
    ├── index.ts                  # Book (extended) + local types
    └── generated.ts              # codegen'd from backend OpenAPI spec
```

**Modified files:**
```
src/context/LibraryContext.tsx    # importBook() updated
app/reader.tsx                    # thin route — renders ReaderContainer
__tests__/
├── ReaderContainer.test.tsx
├── ExtractedReader.test.tsx
├── BlockRenderer.test.tsx
├── extractionApi.test.ts
└── LibraryContext.test.tsx       # updated for new importBook() flow
```

---

## Type Strategy

FastAPI auto-generates an OpenAPI spec. `openapi-typescript` converts it to TypeScript types:

```bash
npm run generate:types
# runs: npx openapi-typescript http://localhost:8000/openapi.json -o src/types/generated.ts
```

`generated.ts` is committed to the repo so the mobile app can build without the backend running. Re-run the script whenever the backend contract changes.

`src/types/index.ts` imports from `generated.ts` and extends the `Book` type:

```ts
import type { components } from './generated';

export type ExtractionBlock = components['schemas']['Block'];
export type ExtractionResult = components['schemas']['ExtractionResponse'];
export type ExtractionStatus = 'pending' | 'ready' | 'failed';
// 'ready' covers both backend 'success' and 'partial' — confidence badge is driven by overall_confidence

export type Book = {
  id: string;
  filename: string;
  path: string;
  addedAt: string;
  extractionStatus: ExtractionStatus;
  extractionResult?: ExtractionResult;
};
```

---

## Updated `importBook()` Flow

```
1. Open document picker
2. On cancel: return silently
3. Copy file to app documents dir with a temporary filename
4. Add book to library immediately with extractionStatus: 'pending'
5. POST file to backend (extractionApi.extractPdf)
   ├── Success:
   │   ├── Rename local file to use returned book_id as prefix
   │   ├── Update Book.id to returned book_id
   │   ├── Store ExtractionResult on the Book record
   │   └── Set extractionStatus: 'ready' if backend status === 'success' or 'partial'
   │       Set extractionStatus: 'failed' if backend status === 'failed'
   └── Error (backend offline / network failure):
       └── Set extractionStatus: 'failed'
6. Persist updated book to AsyncStorage
7. Re-render library list
```

---

## Component Design

### `app/reader.tsx`

Thin Expo Router entry point. Reads `bookId` and `uri` from route params, looks up the book from `LibraryContext`, renders `<ReaderContainer>`.

```tsx
export default function ReaderScreen() {
  const { bookId, uri } = useLocalSearchParams<{ bookId: string; uri: string }>();
  const { books } = useLibrary();
  const book = books.find(b => b.id === bookId);
  return <ReaderContainer book={book} uri={uri} />;
}
```

Note: `LibraryScreen` must pass `bookId` as a route param in addition to `uri`.

### `ReaderContainer.tsx`

Owns the "which view to show" logic. No UI of its own beyond status banners.

| `extractionStatus` | Render |
|---|---|
| `ready` | `<ExtractedReader>` |
| `pending` | `<NativePdfViewer>` + "Reader mode processing…" banner |
| `failed` | `<NativePdfViewer>` + "Reader mode unavailable" notice |
| `book` not found | `<NativePdfViewer>` error state |

### `NativePdfViewer.tsx`

Extracted from the current `app/reader.tsx`. Props: `uri: string`. Wraps `react-native-pdf` with `trustAllCerts={false}`, `source={{ uri, cache: false }}`, and the existing `onError` → error state pattern.

### `ExtractedReader.tsx`

Receives `extractionResult: ExtractionResult`. Manages local state for reader settings (font size, background). Renders:
1. `<ConfidenceBadge overall={extractionResult.overall_confidence} />`
2. `<ReaderSettings>` — collapsible panel, font size and background colour
3. Scrollable list of `<BlockRenderer block={block} />` for each block in `extractionResult.blocks`

### `BlockRenderer.tsx`

Renders a single block based on `block.type`:
- `heading` — `<Text>` with larger font weight and size
- `text` — `<Text>` with body copy styles, inherits reader font size
- `table` — horizontally-scrollable `<ScrollView>` containing a `<Markdown>` component (via `react-native-markdown-display`)

Blocks with `confidence < 0.6` render with an amber left border (`borderLeftWidth: 3, borderLeftColor: '#F59E0B'`).

### `ConfidenceBadge.tsx`

Overall badge at top of reader:
- `>= 0.8` — green (`#10B981`) — "High confidence"
- `0.5–0.79` — amber (`#F59E0B`) — "Partial confidence"
- `< 0.5` — not shown (reader mode not displayed)

### `ReaderSettings.tsx`

Collapsible panel. Two controls:

**Font size:**
| Label | Size |
|---|---|
| S | 14 |
| M | 16 (default) |
| L | 18 |
| XL | 22 |

**Background colour:**
| Label | Background | Text |
|---|---|---|
| White | `#FFFFFF` | `#111111` |
| Sepia | `#F5E6C8` | `#3B2F2F` |
| Dark | `#1A1A1A` | `#E5E5E5` |

Settings are stored in component state only (not persisted to AsyncStorage in v1).

---

## `extractionApi.ts`

Single exported function:

```ts
export async function extractPdf(fileUri: string): Promise<ExtractionResult> {
  const formData = new FormData();
  formData.append('pdf_file', { uri: fileUri, name: 'upload.pdf', type: 'application/pdf' });

  const response = await fetch('http://localhost:8000/extract', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) throw new Error(`Extraction failed: ${response.status}`);
  return response.json() as Promise<ExtractionResult>;
}
```

Throws on network error or non-200 response. Caller (`importBook`) catches and sets `extractionStatus: 'failed'`.

---

## Error Handling

| Failure | Behaviour |
|---|---|
| Backend offline | `extractPdf` throws → `extractionStatus: 'failed'` → native PDF + "Reader mode unavailable" |
| Backend returns `status: failed` | `extractionStatus: 'failed'` → native PDF + notice |
| Backend returns `status: partial` | `extractionStatus: 'ready'` — extracted view shown with amber overall badge |
| Book tapped while `pending` | Native PDF shown immediately; reader view available after extraction completes |
| `uri` or `bookId` missing in route | `ReaderContainer` renders `NativePdfViewer` error state |
| Block `confidence < 0.6` | Amber left-border on that block; no fallback |

---

## Data Flow: Library Screen → Reader

`LibraryScreen` must pass both `bookId` and `uri` when navigating:

```ts
router.push({
  pathname: '/reader',
  params: { bookId: book.id, uri: book.path },
});
```

---

## Testing

**`extractionApi.test.ts`:**
- Mock `fetch` — assert correct `FormData` shape sent
- Mock 200 response → assert `ExtractionResult` returned
- Mock 500 response → assert throws
- Mock network failure → assert throws

**`LibraryContext.test.tsx` (updated):**
- Mock `extractionApi` to return a known `ExtractionResult`
- Assert book created with `extractionStatus: 'pending'` then updated to `'ready'`
- Mock `extractionApi` to throw → assert `extractionStatus: 'failed'`
- Assert `Book.id` set to returned `book_id`

**`ReaderContainer.test.tsx`:**
- `extractionStatus: 'ready'` → renders `ExtractedReader`
- `extractionStatus: 'pending'` → renders `NativePdfViewer` + processing banner text
- `extractionStatus: 'failed'` → renders `NativePdfViewer` + unavailable notice text
- `book` undefined → renders error state

**`ExtractedReader.test.tsx`:**
- Renders confidence badge
- Font size toggle updates text size
- Background colour toggle updates background

**`BlockRenderer.test.tsx`:**
- `heading` block renders with bold/large text
- `text` block renders content
- `table` block renders markdown
- Block with `confidence < 0.6` has amber left border

---

## Out of Scope (v1)

- Persisting reader settings (font size, background) across sessions
- Equation / figure rendering
- Manual "re-extract" action
- Reader mode for already-imported books (only new imports trigger extraction)
- Progress indicator during extraction (book shows `pending` state in library list)
