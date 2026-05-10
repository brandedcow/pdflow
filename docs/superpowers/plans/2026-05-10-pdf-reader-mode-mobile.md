# PDF Reader Mode — Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Kindle-like reader mode to pdflow: PDFs are sent to the local extraction backend at import time, results cached on-device, and displayed by default with font size and background colour controls.

**Architecture:** `importBook()` sends the PDF to the backend and creates the Book with a `pending` status immediately so the library updates without blocking. When extraction completes the book is updated to `ready` (or `failed`). `ReaderContainer` decides which view to show based on `extractionStatus`. All reader UI lives under `src/components/reader/`. TypeScript types are codegen'd from the backend's OpenAPI spec so the contract is never duplicated manually.

**Tech Stack:** TypeScript, React Native, Expo Router, `openapi-typescript` (type codegen), `react-native-markdown-display` (table rendering), existing stack unchanged.

**Prerequisites:** The backend server must be running on `http://localhost:8000` to generate types (Task 1) and for extraction to work at runtime.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types/generated.ts` | Create (codegen) | Auto-generated TypeScript types from backend OpenAPI spec |
| `src/types/index.ts` | Modify | Extend `Book` with `extractionStatus` + `extractionResult`; re-export generated types |
| `src/storage/storage.ts` | Modify | Add `replaceBook()` for updating a book after extraction completes |
| `src/api/extractionApi.ts` | Create | `extractPdf(fileUri)` — POSTs PDF to backend, returns `ExtractionResult` |
| `src/context/LibraryContext.tsx` | Modify | Updated `importBook()` — creates pending book immediately, extracts in background |
| `src/components/reader/NativePdfViewer.tsx` | Create | Wraps `react-native-pdf` (extracted from `app/reader.tsx`) |
| `src/components/reader/BlockRenderer.tsx` | Create | Renders a single heading / text / table block |
| `src/components/reader/ConfidenceBadge.tsx` | Create | Overall confidence badge (green/amber) |
| `src/components/reader/ReaderSettings.tsx` | Create | Font size + background colour controls |
| `src/components/reader/ExtractedReader.tsx` | Create | Scrollable extracted view with settings and blocks |
| `src/components/reader/ReaderContainer.tsx` | Create | Routes between extracted / native / error views by status |
| `app/reader.tsx` | Modify | Thin route: reads params, renders `<ReaderContainer>` |
| `app/index.tsx` | Modify | Pass `bookId` as route param alongside `uri` |
| `__tests__/extractionApi.test.ts` | Create | Unit tests for API client |
| `__tests__/LibraryContext.test.tsx` | Modify | Updated for new `importBook()` flow |
| `__tests__/storage.test.ts` | Modify | Add tests for `replaceBook()`; update `Book` fixtures |
| `__tests__/ReaderContainer.test.tsx` | Create | Tests for status-based view routing |
| `__tests__/ExtractedReader.test.tsx` | Create | Tests for reader controls |
| `__tests__/BlockRenderer.test.tsx` | Create | Tests for each block type |

---

## Task 1: Install dependencies and generate TypeScript types

**Files:**
- Create: `src/types/generated.ts`
- Modify: `package.json`

- [ ] **Step 1: Install new npm packages**

```bash
npm install react-native-markdown-display
npm install --save-dev openapi-typescript --legacy-peer-deps
```

- [ ] **Step 2: Add the generate:types script to `package.json`**

In `package.json`, add to the `"scripts"` section:
```json
"generate:types": "openapi-typescript http://localhost:8000/openapi.json -o src/types/generated.ts"
```

- [ ] **Step 3: Start the backend (required for codegen)**

In a separate terminal, from the project root:
```bash
cd backend && source .venv/bin/activate && uvicorn main:app --reload
```
Wait until you see `Application startup complete.`

- [ ] **Step 4: Generate the types**

```bash
npm run generate:types
```
Expected: `src/types/generated.ts` created with types for `Block`, `ExtractionResponse`, `BlockType`, `ExtractionStatus`.

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/types/generated.ts
git commit -m "chore: add openapi-typescript codegen and react-native-markdown-display"
```

---

## Task 2: Update shared types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Replace the contents of `src/types/index.ts`**

```ts
import type { components } from './generated';

export type ExtractionBlock = components['schemas']['Block'];
export type ExtractionResult = components['schemas']['ExtractionResponse'];

// 'ready' covers both backend 'success' and 'partial' statuses.
// The confidence badge is driven by ExtractionResult.overall_confidence directly.
export type ExtractionStatus = 'pending' | 'ready' | 'failed';

export type Book = {
  id: string;
  filename: string;
  path: string;
  addedAt: string; // ISO 8601
  extractionStatus: ExtractionStatus;
  extractionResult?: ExtractionResult;
};
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```
Expected: errors about `extractionStatus` missing from `Book` usages in `LibraryContext.tsx`, `storage.test.ts`, and `LibraryContext.test.tsx`. These will be fixed in later tasks — note the count but do not fix them now.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: extend Book type with extractionStatus and ExtractionResult"
```

---

## Task 3: Update storage layer (TDD)

**Files:**
- Modify: `src/storage/storage.ts`
- Modify: `__tests__/storage.test.ts`

- [ ] **Step 1: Add `replaceBook` failing test and update existing fixtures**

Replace the full contents of `__tests__/storage.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveBook, loadBooks, replaceBook } from '../src/storage/storage';
import { Book } from '../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockBook: Book = {
  id: 'test-id-1',
  filename: 'test.pdf',
  path: '/documents/pdfs/test.pdf',
  addedAt: '2026-05-09T00:00:00.000Z',
  extractionStatus: 'pending',
};

describe('loadBooks', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns empty array when nothing is stored', async () => {
    const books = await loadBooks();
    expect(books).toEqual([]);
  });

  it('returns stored books', async () => {
    await AsyncStorage.setItem('pdflow_books', JSON.stringify([mockBook]));
    const books = await loadBooks();
    expect(books).toEqual([mockBook]);
  });

  it('returns empty array when stored data is corrupt JSON', async () => {
    await AsyncStorage.setItem('pdflow_books', 'not-valid-json{{{');
    const books = await loadBooks();
    expect(books).toEqual([]);
  });
});

describe('saveBook', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('saves a book so loadBooks returns it', async () => {
    await saveBook(mockBook);
    const books = await loadBooks();
    expect(books).toHaveLength(1);
    expect(books[0]).toEqual(mockBook);
  });

  it('appends to existing books without overwriting', async () => {
    const second: Book = { ...mockBook, id: 'test-id-2', filename: 'second.pdf' };
    await saveBook(mockBook);
    await saveBook(second);
    const books = await loadBooks();
    expect(books).toHaveLength(2);
    expect(books[1]).toEqual(second);
  });
});

describe('replaceBook', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('replaces a book by old id', async () => {
    await saveBook(mockBook);
    const updated: Book = { ...mockBook, id: 'new-id', extractionStatus: 'ready' };
    await replaceBook('test-id-1', updated);
    const books = await loadBooks();
    expect(books).toHaveLength(1);
    expect(books[0].id).toBe('new-id');
    expect(books[0].extractionStatus).toBe('ready');
  });

  it('does nothing if old id is not found', async () => {
    await saveBook(mockBook);
    const other: Book = { ...mockBook, id: 'ghost-id' };
    await replaceBook('ghost-id', other);
    const books = await loadBooks();
    expect(books).toHaveLength(1);
    expect(books[0].id).toBe('test-id-1');
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
npx jest __tests__/storage.test.ts --no-coverage
```
Expected: FAIL — `replaceBook is not exported from '../src/storage/storage'`

- [ ] **Step 3: Add `replaceBook` to `src/storage/storage.ts`**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Book } from '../types';

const STORAGE_KEY = 'pdflow_books';

export async function loadBooks(): Promise<Book[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Book[];
  } catch {
    return [];
  }
}

export async function saveBook(book: Book): Promise<void> {
  const existing = await loadBooks();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, book]));
}

export async function replaceBook(oldId: string, newBook: Book): Promise<void> {
  const existing = await loadBooks();
  const updated = existing.map((b) => (b.id === oldId ? newBook : b));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/storage.test.ts --no-coverage
```
Expected: PASS — 8 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/storage/storage.ts __tests__/storage.test.ts
git commit -m "feat: add replaceBook to storage layer and update Book fixtures (TDD)"
```

---

## Task 4: Implement extraction API client (TDD)

**Files:**
- Create: `src/api/extractionApi.ts`
- Test: `__tests__/extractionApi.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/extractionApi.test.ts`:

```ts
import { ExtractionResult } from '../src/types';

const mockResult: ExtractionResult = {
  book_id: 'backend-uuid-123',
  status: 'success',
  overall_confidence: 0.92,
  page_count: 5,
  blocks: [
    { type: 'text', content: 'Hello world', page: 1, confidence: 0.92 },
  ],
};

describe('extractPdf', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('POSTs the file and returns ExtractionResult on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });

    const { extractPdf } = await import('../src/api/extractionApi');
    const result = await extractPdf('/documents/pdfs/test.pdf');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/extract',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.book_id).toBe('backend-uuid-123');
    expect(result.status).toBe('success');
    expect(result.blocks).toHaveLength(1);
  });

  it('throws when server returns non-200 status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { extractPdf } = await import('../src/api/extractionApi');
    await expect(extractPdf('/documents/pdfs/test.pdf')).rejects.toThrow('Extraction failed: 500');
  });

  it('throws when network request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network request failed'));

    const { extractPdf } = await import('../src/api/extractionApi');
    await expect(extractPdf('/documents/pdfs/test.pdf')).rejects.toThrow('Network request failed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/extractionApi.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../src/api/extractionApi'`

- [ ] **Step 3: Implement `src/api/extractionApi.ts`**

```ts
import type { ExtractionResult } from '../types';

const BACKEND_URL = 'http://localhost:8000';

export async function extractPdf(fileUri: string): Promise<ExtractionResult> {
  const formData = new FormData();
  formData.append('pdf_file', {
    uri: fileUri,
    name: 'upload.pdf',
    type: 'application/pdf',
  } as unknown as Blob);

  const response = await fetch(`${BACKEND_URL}/extract`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Extraction failed: ${response.status}`);
  }

  return response.json() as Promise<ExtractionResult>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/extractionApi.test.ts --no-coverage
```
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/api/extractionApi.ts __tests__/extractionApi.test.ts
git commit -m "feat: implement extraction API client (TDD)"
```

---

## Task 5: Update LibraryContext.importBook() (TDD)

**Files:**
- Modify: `src/context/LibraryContext.tsx`
- Modify: `__tests__/LibraryContext.test.tsx`

- [ ] **Step 1: Write updated failing tests**

Replace the full contents of `__tests__/LibraryContext.test.tsx`:

```tsx
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LibraryProvider } from '../src/context/LibraryContext';
import { useLibrary } from '../src/hooks/useLibrary';
import { extractPdf } from '../src/api/extractionApi';
import { ExtractionResult } from '../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-document-picker');
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/documents/',
  copyAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mock-pending-uuid'),
}));
jest.mock('../src/api/extractionApi');

const mockExtractionResult: ExtractionResult = {
  book_id: 'backend-book-uuid',
  status: 'success',
  overall_confidence: 0.92,
  page_count: 3,
  blocks: [{ type: 'text', content: 'Hello', page: 1, confidence: 0.92 }],
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LibraryProvider>{children}</LibraryProvider>
);

describe('LibraryContext', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('starts with an empty book list', async () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {});
    expect(result.current.books).toEqual([]);
  });

  it('loads persisted books from storage on mount', async () => {
    const stored = {
      id: 'stored-id',
      filename: 'stored.pdf',
      path: '/mock/documents/pdfs/stored.pdf',
      addedAt: '2026-05-09T00:00:00.000Z',
      extractionStatus: 'ready',
    };
    await AsyncStorage.setItem('pdflow_books', JSON.stringify([stored]));
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {});
    expect(result.current.books).toEqual([stored]);
  });

  it('importBook does nothing when picker is cancelled', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true });
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {
      await result.current.importBook();
    });
    expect(result.current.books).toHaveLength(0);
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it('importBook adds book with pending status immediately then updates to ready', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: '/tmp/test.pdf', name: 'test.pdf' }],
    });
    (extractPdf as jest.Mock).mockResolvedValue(mockExtractionResult);

    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {
      await result.current.importBook();
    });

    expect(result.current.books).toHaveLength(1);
    expect(result.current.books[0].id).toBe('backend-book-uuid');
    expect(result.current.books[0].extractionStatus).toBe('ready');
    expect(result.current.books[0].extractionResult).toEqual(mockExtractionResult);
  });

  it('importBook uses backend book_id as final Book.id', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: '/tmp/test.pdf', name: 'test.pdf' }],
    });
    (extractPdf as jest.Mock).mockResolvedValue(mockExtractionResult);

    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {
      await result.current.importBook();
    });

    expect(result.current.books[0].id).toBe('backend-book-uuid');
  });

  it('importBook sets extractionStatus to failed when backend is offline', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: '/tmp/test.pdf', name: 'test.pdf' }],
    });
    (extractPdf as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {
      await result.current.importBook();
    });

    expect(result.current.books).toHaveLength(1);
    expect(result.current.books[0].extractionStatus).toBe('failed');
    expect(result.current.books[0].id).toBe('mock-pending-uuid');
  });

  it('importBook shows alert and adds no book when file copy fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: '/tmp/test.pdf', name: 'test.pdf' }],
    });
    (FileSystem.copyAsync as jest.Mock).mockRejectedValue(new Error('Storage full'));

    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {
      await result.current.importBook();
    });

    expect(alertSpy).toHaveBeenCalledWith('Import failed', "Couldn't import file");
    expect(result.current.books).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/LibraryContext.test.tsx --no-coverage
```
Expected: FAIL — tests fail due to missing `moveAsync` and `extractPdf` integration.

- [ ] **Step 3: Implement updated `src/context/LibraryContext.tsx`**

```tsx
import React, { createContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Book, ExtractionStatus } from '../types';
import { loadBooks, saveBook, replaceBook } from '../storage/storage';
import { extractPdf } from '../api/extractionApi';

type LibraryContextType = {
  books: Book[];
  importBook: () => Promise<void>;
};

export const LibraryContext = createContext<LibraryContextType | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    loadBooks().then(setBooks);
  }, []);

  async function importBook(): Promise<void> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: false,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    const pendingId = Crypto.randomUUID();
    const destDir = `${FileSystem.documentDirectory}pdfs/`;
    const pendingPath = `${destDir}${pendingId}-${asset.name}`;

    try {
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      await FileSystem.copyAsync({ from: asset.uri, to: pendingPath });
    } catch {
      Alert.alert('Import failed', "Couldn't import file");
      return;
    }

    const pendingBook: Book = {
      id: pendingId,
      filename: asset.name,
      path: pendingPath,
      addedAt: new Date().toISOString(),
      extractionStatus: 'pending',
    };

    await saveBook(pendingBook);
    setBooks((prev) => [...prev, pendingBook]);

    try {
      const extractionResult = await extractPdf(pendingPath);
      const bookId = extractionResult.book_id;
      const finalPath = `${destDir}${bookId}-${asset.name}`;

      await FileSystem.moveAsync({ from: pendingPath, to: finalPath });

      const extractionStatus: ExtractionStatus =
        extractionResult.status === 'failed' ? 'failed' : 'ready';

      const finalBook: Book = {
        ...pendingBook,
        id: bookId,
        path: finalPath,
        extractionStatus,
        extractionResult,
      };

      await replaceBook(pendingId, finalBook);
      setBooks((prev) => prev.map((b) => (b.id === pendingId ? finalBook : b)));
    } catch {
      const failedBook: Book = { ...pendingBook, extractionStatus: 'failed' };
      await replaceBook(pendingId, failedBook);
      setBooks((prev) => prev.map((b) => (b.id === pendingId ? failedBook : b)));
    }
  }

  return (
    <LibraryContext.Provider value={{ books, importBook }}>
      {children}
    </LibraryContext.Provider>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/LibraryContext.test.tsx --no-coverage
```
Expected: PASS — 7 tests passing.

- [ ] **Step 5: Run the full test suite**

```bash
npx jest --no-coverage
```
Expected: PASS — all tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/context/LibraryContext.tsx __tests__/LibraryContext.test.tsx
git commit -m "feat: update importBook to extract PDF at import time (TDD)"
```

---

## Task 6: Implement NativePdfViewer component (TDD)

**Files:**
- Create: `src/components/reader/NativePdfViewer.tsx`
- Modify: `__tests__/ReaderScreen.test.tsx` (update imports after reader.tsx changes)

- [ ] **Step 1: Create `src/components/reader/NativePdfViewer.tsx`**

Extract the PDF rendering and error state from the current `app/reader.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import Pdf from 'react-native-pdf';

type Props = {
  uri: string | undefined;
};

export default function NativePdfViewer({ uri }: Props) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!uri) setHasError(true);
  }, [uri]);

  if (hasError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Could not open this PDF.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Pdf
      trustAllCerts={false}
      source={{ uri: uri!, cache: false }}
      onError={() => setHasError(true)}
      style={styles.pdf}
    />
  );
}

const styles = StyleSheet.create({
  pdf: { flex: 1 },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 16, color: '#333', marginBottom: 16, textAlign: 'center' },
  backLink: { fontSize: 16, color: '#007AFF' },
});
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/reader/NativePdfViewer.tsx
git commit -m "feat: extract NativePdfViewer component from reader screen"
```

---

## Task 7: Implement BlockRenderer component (TDD)

**Files:**
- Create: `src/components/reader/BlockRenderer.tsx`
- Test: `__tests__/BlockRenderer.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/BlockRenderer.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import BlockRenderer from '../src/components/reader/BlockRenderer';
import { ExtractionBlock } from '../src/types';

jest.mock('react-native-markdown-display', () => {
  const { Text } = require('react-native');
  return ({ children }: { children: string }) => <Text testID="markdown">{children}</Text>;
});

const makeBlock = (overrides: Partial<ExtractionBlock> = {}): ExtractionBlock => ({
  type: 'text',
  content: 'Sample content',
  page: 1,
  confidence: 0.9,
  ...overrides,
});

describe('BlockRenderer', () => {
  it('renders text block content', () => {
    const { getByText } = render(<BlockRenderer block={makeBlock()} fontSize={16} />);
    expect(getByText('Sample content')).toBeTruthy();
  });

  it('renders heading block with bold style', () => {
    const { getByText } = render(
      <BlockRenderer block={makeBlock({ type: 'heading', content: 'My Heading' })} fontSize={16} />
    );
    expect(getByText('My Heading')).toBeTruthy();
  });

  it('renders table block via markdown', () => {
    const tableContent = '| A | B |\n|---|---|\n| 1 | 2 |';
    const { getByTestId } = render(
      <BlockRenderer block={makeBlock({ type: 'table', content: tableContent })} fontSize={16} />
    );
    expect(getByTestId('markdown')).toBeTruthy();
  });

  it('shows amber left border when confidence is below 0.6', () => {
    const { getByTestId } = render(
      <BlockRenderer block={makeBlock({ confidence: 0.4 })} fontSize={16} testID="block" />
    );
    const block = getByTestId('block');
    expect(block.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderLeftColor: '#F59E0B' })])
    );
  });

  it('does not show amber border when confidence is 0.6 or above', () => {
    const { getByTestId } = render(
      <BlockRenderer block={makeBlock({ confidence: 0.6 })} fontSize={16} testID="block" />
    );
    const block = getByTestId('block');
    const styles = block.props.style;
    const hasBorder = JSON.stringify(styles).includes('#F59E0B');
    expect(hasBorder).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/BlockRenderer.test.tsx --no-coverage
```
Expected: FAIL — `Cannot find module '../src/components/reader/BlockRenderer'`

- [ ] **Step 3: Implement `src/components/reader/BlockRenderer.tsx`**

```tsx
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { ExtractionBlock } from '../../types';

type Props = {
  block: ExtractionBlock;
  fontSize: number;
  testID?: string;
};

export default function BlockRenderer({ block, fontSize, testID }: Props) {
  const lowConfidence = block.confidence < 0.6;
  const containerStyle = [
    styles.container,
    lowConfidence && styles.lowConfidence,
  ];

  if (block.type === 'heading') {
    return (
      <View style={containerStyle} testID={testID}>
        <Text style={[styles.heading, { fontSize: fontSize + 4 }]}>{block.content}</Text>
      </View>
    );
  }

  if (block.type === 'table') {
    return (
      <View style={containerStyle} testID={testID}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Markdown>{block.content}</Markdown>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={containerStyle} testID={testID}>
      <Text style={[styles.text, { fontSize }]}>{block.content}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12, paddingHorizontal: 16 },
  lowConfidence: {
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    paddingLeft: 12,
  },
  heading: { fontWeight: '700', color: '#111', marginBottom: 4 },
  text: { color: '#111', lineHeight: 24 },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/BlockRenderer.test.tsx --no-coverage
```
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/reader/BlockRenderer.tsx __tests__/BlockRenderer.test.tsx
git commit -m "feat: implement BlockRenderer with heading/text/table and confidence highlight (TDD)"
```

---

## Task 8: Implement ConfidenceBadge component (TDD)

**Files:**
- Create: `src/components/reader/ConfidenceBadge.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/ConfidenceBadge.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import ConfidenceBadge from '../src/components/reader/ConfidenceBadge';

describe('ConfidenceBadge', () => {
  it('shows "High confidence" for score >= 0.8', () => {
    const { getByText } = render(<ConfidenceBadge overallConfidence={0.92} />);
    expect(getByText(/High confidence/i)).toBeTruthy();
  });

  it('shows "Partial confidence" for score between 0.5 and 0.79', () => {
    const { getByText } = render(<ConfidenceBadge overallConfidence={0.65} />);
    expect(getByText(/Partial confidence/i)).toBeTruthy();
  });

  it('renders green badge for high confidence', () => {
    const { getByTestId } = render(<ConfidenceBadge overallConfidence={0.9} />);
    expect(getByTestId('confidence-badge').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: '#10B981' })])
    );
  });

  it('renders amber badge for partial confidence', () => {
    const { getByTestId } = render(<ConfidenceBadge overallConfidence={0.6} />);
    expect(getByTestId('confidence-badge').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: '#F59E0B' })])
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/ConfidenceBadge.test.tsx --no-coverage
```
Expected: FAIL — `Cannot find module '../src/components/reader/ConfidenceBadge'`

- [ ] **Step 3: Implement `src/components/reader/ConfidenceBadge.tsx`**

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  overallConfidence: number;
};

export default function ConfidenceBadge({ overallConfidence }: Props) {
  const isHigh = overallConfidence >= 0.8;
  const label = isHigh ? 'High confidence' : 'Partial confidence';
  const colour = isHigh ? '#10B981' : '#F59E0B';

  return (
    <View
      testID="confidence-badge"
      style={[styles.badge, { backgroundColor: colour }]}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.score}>{Math.round(overallConfidence * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  label: { color: '#fff', fontWeight: '600', fontSize: 13 },
  score: { color: '#fff', fontSize: 13 },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/ConfidenceBadge.test.tsx --no-coverage
```
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/reader/ConfidenceBadge.tsx __tests__/ConfidenceBadge.test.tsx
git commit -m "feat: implement ConfidenceBadge component (TDD)"
```

---

## Task 9: Implement ReaderSettings component (TDD)

**Files:**
- Create: `src/components/reader/ReaderSettings.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/ReaderSettings.test.tsx`:

```tsx
import React, { useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ReaderSettings, { ReaderConfig, FONT_SIZES, BACKGROUNDS } from '../src/components/reader/ReaderSettings';

function Wrapper() {
  const [config, setConfig] = useState<ReaderConfig>({
    fontSize: 16,
    background: BACKGROUNDS[0],
  });
  return <ReaderSettings config={config} onChange={setConfig} />;
}

describe('ReaderSettings', () => {
  it('renders font size options', () => {
    const { getByText } = render(<Wrapper />);
    FONT_SIZES.forEach(({ label }) => {
      expect(getByText(label)).toBeTruthy();
    });
  });

  it('renders background colour options', () => {
    const { getByText } = render(<Wrapper />);
    BACKGROUNDS.forEach(({ label }) => {
      expect(getByText(label)).toBeTruthy();
    });
  });

  it('calls onChange with new font size when option tapped', () => {
    const onChange = jest.fn();
    const config: ReaderConfig = { fontSize: 16, background: BACKGROUNDS[0] };
    const { getByText } = render(<ReaderSettings config={config} onChange={onChange} />);
    fireEvent.press(getByText('XL'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 22 }));
  });

  it('calls onChange with new background when option tapped', () => {
    const onChange = jest.fn();
    const config: ReaderConfig = { fontSize: 16, background: BACKGROUNDS[0] };
    const { getByText } = render(<ReaderSettings config={config} onChange={onChange} />);
    fireEvent.press(getByText('Sepia'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ background: expect.objectContaining({ label: 'Sepia' }) })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/ReaderSettings.test.tsx --no-coverage
```
Expected: FAIL — `Cannot find module '../src/components/reader/ReaderSettings'`

- [ ] **Step 3: Implement `src/components/reader/ReaderSettings.tsx`**

```tsx
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type Background = {
  label: string;
  background: string;
  text: string;
};

export type ReaderConfig = {
  fontSize: number;
  background: Background;
};

export const FONT_SIZES: { label: string; size: number }[] = [
  { label: 'S', size: 14 },
  { label: 'M', size: 16 },
  { label: 'L', size: 18 },
  { label: 'XL', size: 22 },
];

export const BACKGROUNDS: Background[] = [
  { label: 'White', background: '#FFFFFF', text: '#111111' },
  { label: 'Sepia', background: '#F5E6C8', text: '#3B2F2F' },
  { label: 'Dark', background: '#1A1A1A', text: '#E5E5E5' },
];

type Props = {
  config: ReaderConfig;
  onChange: (config: ReaderConfig) => void;
};

export default function ReaderSettings({ config, onChange }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {FONT_SIZES.map(({ label, size }) => (
          <TouchableOpacity
            key={label}
            style={[styles.option, config.fontSize === size && styles.selected]}
            onPress={() => onChange({ ...config, fontSize: size })}
          >
            <Text style={styles.optionText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.row}>
        {BACKGROUNDS.map((bg) => (
          <TouchableOpacity
            key={bg.label}
            style={[styles.option, { backgroundColor: bg.background }, config.background.label === bg.label && styles.selected]}
            onPress={() => onChange({ ...config, background: bg })}
          >
            <Text style={[styles.optionText, { color: bg.text }]}>{bg.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  option: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: '#ddd' },
  selected: { borderColor: '#000', borderWidth: 2 },
  optionText: { fontSize: 13 },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/ReaderSettings.test.tsx --no-coverage
```
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/reader/ReaderSettings.tsx __tests__/ReaderSettings.test.tsx
git commit -m "feat: implement ReaderSettings with font size and background controls (TDD)"
```

---

## Task 10: Implement ExtractedReader component (TDD)

**Files:**
- Create: `src/components/reader/ExtractedReader.tsx`
- Test: `__tests__/ExtractedReader.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/ExtractedReader.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ExtractedReader from '../src/components/reader/ExtractedReader';
import { ExtractionResult } from '../src/types';

jest.mock('../src/components/reader/BlockRenderer', () => {
  const { Text } = require('react-native');
  return ({ block }: { block: { content: string } }) => <Text testID="block">{block.content}</Text>;
});
jest.mock('../src/components/reader/ConfidenceBadge', () => {
  const { Text } = require('react-native');
  return () => <Text testID="confidence-badge">Badge</Text>;
});
jest.mock('../src/components/reader/ReaderSettings', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ onChange, config }: any) => (
    <TouchableOpacity testID="settings-toggle" onPress={() => onChange({ ...config, fontSize: 22 })}>
      <Text>Settings</Text>
    </TouchableOpacity>
  );
});

const mockResult: ExtractionResult = {
  book_id: 'test-id',
  status: 'success',
  overall_confidence: 0.92,
  page_count: 2,
  blocks: [
    { type: 'heading', content: 'Chapter One', page: 1, confidence: 0.95 },
    { type: 'text', content: 'Body paragraph', page: 1, confidence: 0.9 },
  ],
};

describe('ExtractedReader', () => {
  it('renders confidence badge', () => {
    const { getByTestId } = render(<ExtractedReader result={mockResult} />);
    expect(getByTestId('confidence-badge')).toBeTruthy();
  });

  it('renders all blocks', () => {
    const { getAllByTestId } = render(<ExtractedReader result={mockResult} />);
    expect(getAllByTestId('block')).toHaveLength(2);
  });

  it('renders settings panel', () => {
    const { getByTestId } = render(<ExtractedReader result={mockResult} />);
    expect(getByTestId('settings-toggle')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/ExtractedReader.test.tsx --no-coverage
```
Expected: FAIL — `Cannot find module '../src/components/reader/ExtractedReader'`

- [ ] **Step 3: Implement `src/components/reader/ExtractedReader.tsx`**

```tsx
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ExtractionResult } from '../../types';
import BlockRenderer from './BlockRenderer';
import ConfidenceBadge from './ConfidenceBadge';
import ReaderSettings, { ReaderConfig, BACKGROUNDS, FONT_SIZES } from './ReaderSettings';

type Props = {
  result: ExtractionResult;
};

const DEFAULT_CONFIG: ReaderConfig = {
  fontSize: FONT_SIZES[1].size, // 'M' = 16
  background: BACKGROUNDS[0],   // White
};

export default function ExtractedReader({ result }: Props) {
  const [config, setConfig] = useState<ReaderConfig>(DEFAULT_CONFIG);

  return (
    <View style={[styles.container, { backgroundColor: config.background.background }]}>
      <ConfidenceBadge overallConfidence={result.overall_confidence} />
      <ReaderSettings config={config} onChange={setConfig} />
      <ScrollView contentContainerStyle={styles.content}>
        {result.blocks.map((block, index) => (
          <BlockRenderer key={index} block={block} fontSize={config.fontSize} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: 16 },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/ExtractedReader.test.tsx --no-coverage
```
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/reader/ExtractedReader.tsx __tests__/ExtractedReader.test.tsx
git commit -m "feat: implement ExtractedReader with blocks, badge, and settings (TDD)"
```

---

## Task 11: Implement ReaderContainer component (TDD)

**Files:**
- Create: `src/components/reader/ReaderContainer.tsx`
- Test: `__tests__/ReaderContainer.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/ReaderContainer.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import ReaderContainer from '../src/components/reader/ReaderContainer';
import { Book } from '../src/types';

jest.mock('../src/components/reader/NativePdfViewer', () => {
  const { Text } = require('react-native');
  return () => <Text testID="native-viewer">Native</Text>;
});
jest.mock('../src/components/reader/ExtractedReader', () => {
  const { Text } = require('react-native');
  return () => <Text testID="extracted-reader">Extracted</Text>;
});

const baseBook: Book = {
  id: 'book-1',
  filename: 'test.pdf',
  path: '/docs/test.pdf',
  addedAt: '2026-05-10T00:00:00.000Z',
  extractionStatus: 'ready',
  extractionResult: {
    book_id: 'book-1',
    status: 'success',
    overall_confidence: 0.92,
    page_count: 3,
    blocks: [],
  },
};

describe('ReaderContainer', () => {
  it('renders ExtractedReader when status is ready', () => {
    const { getByTestId } = render(
      <ReaderContainer book={baseBook} uri="/docs/test.pdf" />
    );
    expect(getByTestId('extracted-reader')).toBeTruthy();
  });

  it('renders NativePdfViewer with processing banner when status is pending', () => {
    const book: Book = { ...baseBook, extractionStatus: 'pending', extractionResult: undefined };
    const { getByTestId, getByText } = render(
      <ReaderContainer book={book} uri="/docs/test.pdf" />
    );
    expect(getByTestId('native-viewer')).toBeTruthy();
    expect(getByText('Reader mode processing…')).toBeTruthy();
  });

  it('renders NativePdfViewer with unavailable notice when status is failed', () => {
    const book: Book = { ...baseBook, extractionStatus: 'failed', extractionResult: undefined };
    const { getByTestId, getByText } = render(
      <ReaderContainer book={book} uri="/docs/test.pdf" />
    );
    expect(getByTestId('native-viewer')).toBeTruthy();
    expect(getByText('Reader mode unavailable')).toBeTruthy();
  });

  it('renders NativePdfViewer error state when book is undefined', () => {
    const { getByTestId } = render(
      <ReaderContainer book={undefined} uri="/docs/test.pdf" />
    );
    expect(getByTestId('native-viewer')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/ReaderContainer.test.tsx --no-coverage
```
Expected: FAIL — `Cannot find module '../src/components/reader/ReaderContainer'`

- [ ] **Step 3: Implement `src/components/reader/ReaderContainer.tsx`**

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Book } from '../../types';
import NativePdfViewer from './NativePdfViewer';
import ExtractedReader from './ExtractedReader';

type Props = {
  book: Book | undefined;
  uri: string | undefined;
};

export default function ReaderContainer({ book, uri }: Props) {
  if (!book || book.extractionStatus === 'failed') {
    return (
      <View style={styles.container}>
        {book?.extractionStatus === 'failed' && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Reader mode unavailable</Text>
          </View>
        )}
        <NativePdfViewer uri={uri} />
      </View>
    );
  }

  if (book.extractionStatus === 'pending') {
    return (
      <View style={styles.container}>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Reader mode processing…</Text>
        </View>
        <NativePdfViewer uri={uri} />
      </View>
    );
  }

  if (book.extractionStatus === 'ready' && book.extractionResult) {
    return <ExtractedReader result={book.extractionResult} />;
  }

  return <NativePdfViewer uri={uri} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  bannerText: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/ReaderContainer.test.tsx --no-coverage
```
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/reader/ReaderContainer.tsx __tests__/ReaderContainer.test.tsx
git commit -m "feat: implement ReaderContainer with status-based view routing (TDD)"
```

---

## Task 12: Wire up reader route and update library navigation

**Files:**
- Modify: `app/reader.tsx`
- Modify: `app/index.tsx`
- Modify: `__tests__/ReaderScreen.test.tsx`
- Modify: `__tests__/LibraryScreen.test.tsx`

- [ ] **Step 1: Replace `app/reader.tsx`**

```tsx
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibrary } from '../src/hooks/useLibrary';
import ReaderContainer from '../src/components/reader/ReaderContainer';

export default function ReaderScreen() {
  const { bookId, uri } = useLocalSearchParams<{ bookId: string; uri: string }>();
  const { books } = useLibrary();
  const insets = useSafeAreaInsets();
  const book = books.find((b) => b.id === bookId);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
      </View>
      <ReaderContainer book={book} uri={uri} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  backButton: { fontSize: 16, color: '#111' },
});
```

- [ ] **Step 2: Update `app/index.tsx` to pass `bookId` as a route param**

Change `handleBookPress`:
```tsx
function handleBookPress(book: Book) {
  router.push({ pathname: '/reader', params: { bookId: book.id, uri: book.path } });
}
```

- [ ] **Step 3: Update `__tests__/ReaderScreen.test.tsx` to match new reader.tsx**

Replace the full contents of `__tests__/ReaderScreen.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import ReaderScreen from '../app/reader';
import { useLibrary } from '../src/hooks/useLibrary';

jest.mock('../src/hooks/useLibrary');
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ bookId: 'book-1', uri: '/docs/test.pdf' }),
  router: { back: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../src/components/reader/ReaderContainer', () => {
  const { Text } = require('react-native');
  return () => <Text testID="reader-container">Container</Text>;
});

describe('ReaderScreen', () => {
  it('renders the back button', () => {
    (useLibrary as jest.Mock).mockReturnValue({ books: [], importBook: jest.fn() });
    const { getByText } = render(<ReaderScreen />);
    expect(getByText('← Back')).toBeTruthy();
  });

  it('renders ReaderContainer', () => {
    (useLibrary as jest.Mock).mockReturnValue({ books: [], importBook: jest.fn() });
    const { getByTestId } = render(<ReaderScreen />);
    expect(getByTestId('reader-container')).toBeTruthy();
  });
});
```

- [ ] **Step 4: Update `__tests__/LibraryScreen.test.tsx` to pass `bookId` in navigation**

In `__tests__/LibraryScreen.test.tsx`, update the navigation assertion:
```ts
expect(router.push).toHaveBeenCalledWith({
  pathname: '/reader',
  params: { bookId: book.id, uri: book.path },
});
```

Also update the `makeBook` factory to include `extractionStatus`:
```ts
const makeBook = (overrides: Partial<Book> = {}): Book => ({
  id: '1',
  filename: 'test.pdf',
  path: '/docs/test.pdf',
  addedAt: '2026-05-09T00:00:00.000Z',
  extractionStatus: 'ready',
  ...overrides,
});
```

- [ ] **Step 5: Run the full test suite**

```bash
npx jest --no-coverage
```
Expected: PASS — all tests passing.

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add app/reader.tsx app/index.tsx __tests__/ReaderScreen.test.tsx __tests__/LibraryScreen.test.tsx
git commit -m "feat: wire ReaderContainer into reader route and update library navigation"
```

---

## Done

The reader mode is fully implemented. Import flow:

1. User taps `+` → selects PDF
2. Book appears immediately in library with "processing" status
3. Extraction runs in background against `http://localhost:8000`
4. Book updates to `ready` → tapping opens the extracted reader view

To regenerate types after a backend contract change:
```bash
npm run generate:types
```
