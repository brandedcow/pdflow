# Duplicate Import Guard — Design Spec

**Date:** 2026-05-11
**Status:** Approved

## Problem

Re-uploading a PDF that is already in the library creates a second entry with the same filename. The user has no indication that the file already exists.

## Decision

Filename-based deduplication. When the user picks a file whose `filename` matches an existing book's `filename`, abort the import and inform the user.

## Design

### Guard location

Inside `importBook()` in `src/context/LibraryContext.tsx`, immediately after the document picker resolves and the asset name is known — before any file system work (directory creation, copy, extraction).

### Logic

```
if books.some(b => b.filename === asset.name):
  Alert.alert('Already in library', '"<asset.name>" is already in your library.')
  return
```

### Behaviour

- The check runs against the current `books` state (already in memory — no storage read needed).
- If the filename matches any existing book regardless of its `extractionStatus` (pending, ready, or failed), the import is blocked. A failed book must be deleted before the same filename can be re-imported.
- No file system operations are performed when a duplicate is detected.
- No new storage functions, type changes, or components required.

### User-facing copy

| Field   | Value |
|---------|-------|
| Title   | `Already in library` |
| Message | `"<filename>" is already in your library.` |

## Out of scope

- **Re-extract / replace flow** — if the user wants to refresh a book that failed extraction, they delete it first, then re-import. A dedicated re-extract action (accessible from the reader) is a separate feature.
- **Content-hash deduplication** — filename matching is sufficient for a personal library. Hash comparison can be added later if needed.

## Testing

One new test in `__tests__/LibraryContext.test.tsx`:

- **`importBook shows alert and does not import when filename already exists`**
  - Seed state with a book whose `filename` is `'test.pdf'`
  - Mock picker to return an asset with `name: 'test.pdf'`
  - Assert `Alert.alert` called with `'Already in library'`
  - Assert `FileSystem.copyAsync` not called
  - Assert `books` length unchanged
