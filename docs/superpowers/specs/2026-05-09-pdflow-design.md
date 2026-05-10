# PDFlow — Design Spec
**Date:** 2026-05-09
**Status:** Approved

## Overview

PDFlow is a mobile PDF reader for iOS and Android built with React Native (Expo). Users import PDFs from their device's local storage and read them in a clean, continuous-scroll interface inspired by the Kindle reading experience. There is no backend, no cloud sync, and no user accounts — everything lives on-device.

**v1 scope:** import PDFs, read them in continuous scroll mode, read-only (no annotations). Nothing else.

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Expo managed workflow; custom dev client built via EAS (required for `react-native-pdf` native module) |
| Language | TypeScript (strict mode) |
| PDF rendering | `react-native-pdf` (wraps PDFKit on iOS, PdfRenderer on Android) |
| File import | `expo-document-picker` |
| File storage | `expo-file-system` |
| Library persistence | `AsyncStorage` (`@react-native-async-storage/async-storage`) |
| Navigation | React Navigation (stack navigator) |
| Linting | `eslint-config-expo` |
| Testing | Jest + `@testing-library/react-native` |
| Test methodology | TDD — red/green cycle (failing test first, then minimum implementation) |

---

## Architecture

Single-tier client — no network calls, no backend.

Three layers:

**Storage layer** — `expo-file-system` copies imported PDFs into the app's document directory (`<app-documents>/pdfs/`). AsyncStorage holds library metadata (id, filename, path, addedAt). Files in the document directory survive app restarts and OS-level cleanup.

**State layer** — a single `LibraryContext` (React Context) exposes the books array and the `importBook()` action. No Redux or external state manager needed at this scope.

**UI layer** — two screens (Library, Reader) wired by a React Navigation stack navigator.

---

## Components & Screens

### LibraryScreen
- Flat list of imported PDFs showing filename and date added
- Floating action button triggers `expo-document-picker` filtered to PDFs
- Empty state with an import prompt when the library is empty
- Tapping a book navigates to ReaderScreen with the file URI as a route param

### ReaderScreen
- Full-screen `react-native-pdf` in continuous scroll mode
- Thin top bar: filename + back button
- No other UI chrome — clean reading surface
- Displays an inline error message (with back button) if the PDF fails to render

### AppNavigator
- React Navigation stack with two routes: `Library` (initial) and `Reader`
- Passes `{ uri: string }` as a param to ReaderScreen

### LibraryContext
- Wraps the app at the root
- State: `books: Book[]`
- Actions: `importBook()` — calls document picker, copies file, updates AsyncStorage, re-renders list
- Calls `loadBooks()` on mount to rehydrate from AsyncStorage

### useLibrary hook
- Thin wrapper around `useContext(LibraryContext)` for screens to consume

### storage.ts
- `saveBook(book: Book): Promise<void>` — appends metadata to AsyncStorage
- `loadBooks(): Promise<Book[]>` — reads and parses the full books array from AsyncStorage

### Types

```ts
type Book = {
  id: string;        // uuid
  filename: string;
  path: string;      // absolute local URI inside app documents dir
  addedAt: string;   // ISO 8601
};
```

---

## Data Flow

### Import
1. User taps FAB → `expo-document-picker` opens native picker filtered to PDFs
2. If cancelled, `importBook()` exits silently
3. File is copied from the temporary picker URI to `<app-documents>/pdfs/<filename>` via `expo-file-system`
4. Metadata `{ id, filename, path, addedAt }` is appended to AsyncStorage
5. `LibraryContext` state updates → LibraryScreen re-renders with the new book

### Read
1. User taps a book → Navigator pushes ReaderScreen with `{ uri: book.path }`
2. `react-native-pdf` renders from the local file URI natively — no server, no conversion
3. Back button pops the stack; no state saved (read-only, no position tracking in v1)

### App Start
1. `LibraryContext` calls `loadBooks()` on mount
2. Populates state from AsyncStorage; shows empty state if the array is empty

---

## Error Handling

| Failure point | Behaviour |
|---|---|
| User cancels document picker | Silent exit, no error shown |
| File copy fails (e.g. storage full) | Alert with plain message: "Couldn't import file" |
| PDF fails to render | Inline error message on ReaderScreen with back button |

No retry logic or crash reporting in v1.

---

## Tooling & Code Quality

**TypeScript** — `strict: true`, `noImplicitAny`. All files `.ts` / `.tsx`. No `any` escapes.

**ESLint** — `eslint-config-expo` covering React, React Native, and TypeScript rules. Run on every file change in development and enforced in CI.

**Prettier** — consistent formatting, integrated with ESLint.

---

## Testing

**Methodology:** TDD red/green cycle. Every unit is written test-first:
1. Write a failing test that describes the intended behaviour
2. Write the minimum implementation to make it pass
3. Refactor without breaking the test

**Unit tests (Jest):**
- `storage.ts` — mock AsyncStorage and `expo-file-system`; verify `saveBook` persists correctly and `loadBooks` rehydrates state
- `importBook()` in LibraryContext — mock the document picker and file system; verify the books array updates on success and is unchanged on cancel or error

**Component tests (`@testing-library/react-native`):**
- LibraryScreen: empty state renders correctly; list renders imported books; FAB triggers import
- ReaderScreen: error state renders with back button when `onError` fires

**What's not tested in v1:** E2E tests, navigation integration tests. The surface is small enough for manual simulator testing.

---

## File Structure

```
pdflow/
├── app/
│   ├── _layout.tsx          # Root layout, wraps with LibraryContext
│   ├── index.tsx            # LibraryScreen
│   └── reader.tsx           # ReaderScreen
├── src/
│   ├── context/
│   │   └── LibraryContext.tsx
│   ├── hooks/
│   │   └── useLibrary.ts
│   ├── storage/
│   │   └── storage.ts
│   └── types/
│       └── index.ts         # Book type and other shared types
├── __tests__/
│   ├── storage.test.ts
│   ├── LibraryContext.test.tsx
│   ├── LibraryScreen.test.tsx
│   └── ReaderScreen.test.tsx
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-05-09-pdflow-design.md
├── app.json
├── tsconfig.json
├── .eslintrc.js
└── package.json
```

---

## Out of Scope (v1)

- Cloud storage or cross-device sync
- Annotations, highlights, or notes
- Bookmarks or reading position persistence
- Paginated reading mode
- Search within PDF
- PDF metadata display (author, page count in library view)
