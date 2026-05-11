# Reader UX Improvements Design

**Date:** 2026-05-11
**Status:** Approved

## Overview

Three connected UX improvements:
1. Extraction status icons on library rows
2. Reader/PDF view toggle in the reader header
3. Retry extraction from both the library row and the reader header

## Section 1 — Library Row Status Icons

`BookRow` gains a status icon on the right side of the row, vertically centred with the filename.

| `extractionStatus` | Icon | Behaviour |
|--------------------|------|-----------|
| `pending` | `ActivityIndicator` (grey spinner) | Non-interactive |
| `failed` | Red alert icon | Tappable → calls `retryExtraction(book.id)` |
| `ready` | Nothing | — |

The row remains tappable in all states. Opening a `pending` book navigates to the reader, which shows the native PDF with the toggle greyed out.

## Section 2 — Reader Header Controls

The reader header (`app/reader.tsx`) gains up to two icon buttons on the right side:

```
[← Back]                    [↻ retry?]  [⊞ toggle]
```

State matrix:

| `extractionStatus` | Toggle icon | Retry icon |
|--------------------|-------------|------------|
| `pending` | Visible, greyed out, non-interactive | Hidden |
| `failed` | Hidden | Visible, tappable |
| `ready` | Active, tappable | Hidden |

The toggle icon reflects the current view:
- In PDF view → document-text icon (tap to enter reader)
- In reader view → plain document icon (tap to return to PDF)

`activeView: 'pdf' | 'reader'` state lives in `reader.tsx`. Default: `'reader'` when `extractionStatus === 'ready'`, `'pdf'` otherwise.

## Section 3 — ReaderContainer & View Switching

`ReaderContainer` props expand from `{ book, uri }` to `{ book, uri, activeView }`.

Rendering logic:

```
activeView === 'reader' && extractionStatus === 'ready'  →  ExtractedReader
everything else                                          →  NativePdfViewer
```

The status banner is removed from `ReaderContainer`. All status messaging moves to the header in `reader.tsx`, which already has full state context. `ReaderContainer` becomes a pure view-switcher.

## Section 4 — Retry Mechanism

### `LibraryContext` changes

A `retryExtraction(bookId: string): Promise<void>` function is added to `LibraryContextType` and the provider.

Logic:
1. Find book by ID; no-op if not found or already `pending`
2. Set `extractionStatus: 'pending'` in state and storage
3. Call `runExtraction(bookId, book)` — shared helper (see below)

### `runExtraction` helper

Extracted private function used by both `importBook` and `retryExtraction`:

```
runExtraction(pendingId: string, book: Book): Promise<void>
```

Steps:
1. POST `book.path` to `/extract`
2. Receive new `book_id` from backend
3. Rename file from `<pendingId>-<filename>` to `<bookId>-<filename>`
4. Determine `extractionStatus`: `'ready'` if backend status is `success` or `partial`, `'failed'` if `failed`
5. Build `finalBook` with new id, path, status, result
6. `replaceBook(pendingId, finalBook)` in storage
7. Replace in state

On any exception: set book back to `'failed'` in state and storage.

### Files changed

| File | Change |
|------|--------|
| `src/context/LibraryContext.tsx` | Extract `runExtraction` helper; add `retryExtraction`; update context type |
| `app/index.tsx` | Pass `retryExtraction` to `BookRow`; add status icon to row |
| `app/reader.tsx` | Add `activeView` state; add toggle + retry icons to header |
| `src/components/reader/ReaderContainer.tsx` | Accept `activeView` prop; remove banner; simplify render logic |

## Out of Scope

- Persisting the user's last view preference per book
- Showing extraction progress (percentage)
- Auto-retry on failure
