# Delete Book Feature Design

**Date:** 2026-05-10

## Overview

Users need to be able to delete books from their library. Deletion removes the book from AsyncStorage and deletes the PDF file from the device filesystem.

## UX Pattern

Swipe-to-delete using `Swipeable` from `react-native-gesture-handler` (already bundled with Expo — no new dependencies). Swiping a row left reveals a red "Delete" action button. Tapping it shows a native `Alert` confirmation before proceeding.

Confirmation dialog:
- Title: `Delete "<filename>"?`
- Body: `This cannot be undone.`
- Buttons: Cancel (cancel style) | Delete (destructive style)

The swipeable row snaps back after the Alert is dismissed, whether or not the user confirms.

## Data Layer

### `storage.ts`

Add `deleteBook(id: string)`: loads the current list, filters out the matching id, writes back to AsyncStorage.

### `LibraryContext.tsx`

Add `deleteBook(id: string)` to context type and implementation:

1. Look up the book by id to get its `path`
2. Call `FileSystem.deleteAsync(book.path, { idempotent: true })` — does not throw if file is already gone
3. Call `storage.deleteBook(id)`
4. Call `setBooks(prev => prev.filter(b => b.id !== id))`

Error handling: if the filesystem delete throws, show `Alert.alert('Delete failed', ...)` and bail without touching storage or state.

### `useLibrary.ts`

No changes needed — it already re-exports everything in the context.

## UI Layer

### `app/index.tsx`

- Import `Swipeable` from `react-native-gesture-handler`
- Wrap each `FlatList` row in `Swipeable` with a `renderRightActions` prop that renders a red "Delete" button
- On "Delete" button press: show the confirmation `Alert`; close the swipeable via ref after the Alert is dismissed (whether confirmed or cancelled)
- On confirmation: call `deleteBook(book.id)` from `useLibrary`

## Edge Cases

**In-flight pending book:** If a book is deleted while its extraction is still running, `importBook`'s `FileSystem.moveAsync` will fail (file gone), the catch block calls `replaceBook(pendingId, failedBook)` — which is a no-op since the id no longer exists in storage. State and storage remain clean.

**File already missing:** `idempotent: true` on `deleteAsync` ensures this does not throw.

## Files Changed

| File | Change |
|------|--------|
| `src/storage/storage.ts` | Add `deleteBook(id)` |
| `src/context/LibraryContext.tsx` | Add `deleteBook(id)`, expose via context |
| `app/index.tsx` | Wrap rows in `Swipeable`, wire up delete flow |
