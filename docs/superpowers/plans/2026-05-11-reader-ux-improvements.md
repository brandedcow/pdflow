# Reader UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add extraction status icons to library rows, a view toggle and retry button in the reader header, and a `retryExtraction` function in `LibraryContext`.

**Architecture:** Extract the extraction logic from `importBook` into a shared `runExtraction(currentId, book)` helper; add `retryExtraction` to the context. `ReaderContainer` becomes a pure view-switcher driven by an `activeView` prop owned by `reader.tsx`. Header icons live in `reader.tsx` alongside the back button.

**Tech Stack:** React Native, Expo SDK 54, `@expo/vector-icons` (Ionicons — bundled with Expo SDK, no install needed), `@testing-library/react-native`

---

## File Map

| File | Change |
|------|--------|
| `src/context/LibraryContext.tsx` | Extract `runExtraction` helper; add `retryExtraction`; update context type |
| `app/reader.tsx` | Add `activeView` state; add toggle + retry icons to header; pass `activeView` to `ReaderContainer` |
| `src/components/reader/ReaderContainer.tsx` | Accept `activeView` prop; remove banner; simplify to pure view-switcher |
| `app/index.tsx` | Add `BookStatusIcon` component; wire `retryExtraction` into `BookRow` |
| `__tests__/LibraryContext.test.tsx` | Add `retryExtraction` tests |
| `__tests__/ReaderContainer.test.tsx` | Update tests for `activeView` prop; remove banner assertions |
| `__tests__/ReaderScreen.test.tsx` | Add header icon tests |
| `__tests__/LibraryScreen.test.tsx` | Add status icon tests; add `retryExtraction` mock to all `useLibrary` calls |

---

## Task 1: LibraryContext — extract `runExtraction` + add `retryExtraction`

**Files:**
- Modify: `src/context/LibraryContext.tsx`
- Test: `__tests__/LibraryContext.test.tsx`

- [ ] **Step 1: Add `retryExtraction` tests to `__tests__/LibraryContext.test.tsx`**

Append this `describe` block after the existing `deleteBook` describe block (before the final closing `}`):

```typescript
  describe('retryExtraction', () => {
    const failedBook = {
      id: 'failed-id',
      filename: 'test.pdf',
      path: '/mock/documents/pdfs/failed-id-test.pdf',
      addedAt: '2026-05-11T00:00:00.000Z',
      extractionStatus: 'failed' as const,
    };

    it('sets status to pending then ready on success', async () => {
      await AsyncStorage.setItem('pdflow_books', JSON.stringify([failedBook]));
      (extractPdf as jest.Mock).mockResolvedValue(mockExtractionResult);

      const { result } = renderHook(() => useLibrary(), { wrapper });
      await act(async () => {});

      await act(async () => {
        await result.current.retryExtraction('failed-id');
      });

      expect(result.current.books[0].id).toBe('backend-book-uuid');
      expect(result.current.books[0].extractionStatus).toBe('ready');
      expect(result.current.books[0].extractionResult).toEqual(mockExtractionResult);
    });

    it('sets status back to failed when extraction throws', async () => {
      await AsyncStorage.setItem('pdflow_books', JSON.stringify([failedBook]));
      (extractPdf as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useLibrary(), { wrapper });
      await act(async () => {});

      await act(async () => {
        await result.current.retryExtraction('failed-id');
      });

      expect(result.current.books[0].extractionStatus).toBe('failed');
    });

    it('is a no-op when book is already pending', async () => {
      const pendingBook = { ...failedBook, id: 'pending-id', extractionStatus: 'pending' as const };
      await AsyncStorage.setItem('pdflow_books', JSON.stringify([pendingBook]));

      const { result } = renderHook(() => useLibrary(), { wrapper });
      await act(async () => {});

      await act(async () => {
        await result.current.retryExtraction('pending-id');
      });

      expect(extractPdf).not.toHaveBeenCalled();
      expect(result.current.books[0].extractionStatus).toBe('pending');
    });

    it('is a no-op when book id is not found', async () => {
      const { result } = renderHook(() => useLibrary(), { wrapper });
      await act(async () => {});

      await act(async () => {
        await result.current.retryExtraction('nonexistent-id');
      });

      expect(extractPdf).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
npx jest __tests__/LibraryContext.test.tsx --no-coverage
```

Expected: the four `retryExtraction` tests fail with "result.current.retryExtraction is not a function".

- [ ] **Step 3: Replace `src/context/LibraryContext.tsx` with the updated implementation**

```typescript
import React, { createContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { File as FSFile } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { Book, ExtractionStatus } from '../types';
import { loadBooks, saveBook, replaceBook, deleteBook as storageDeleteBook } from '../storage/storage';
import { extractPdf } from '../api/extractionApi';

type LibraryContextType = {
  books: Book[];
  importBook: () => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  retryExtraction: (bookId: string) => Promise<void>;
};

export const LibraryContext = createContext<LibraryContextType | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    loadBooks().then(setBooks);
  }, []);

  async function runExtraction(currentId: string, book: Book): Promise<void> {
    const destDir = `${FileSystem.documentDirectory}pdfs/`;
    try {
      const extractionResult = await extractPdf(book.path);
      const bookId = extractionResult.book_id;
      const finalPath = `${destDir}${bookId}-${book.filename}`;
      new FSFile(book.path).move(new FSFile(finalPath));
      const extractionStatus: ExtractionStatus =
        extractionResult.status === 'failed' ? 'failed' : 'ready';
      const finalBook: Book = {
        ...book,
        id: bookId,
        path: finalPath,
        extractionStatus,
        extractionResult,
      };
      await replaceBook(currentId, finalBook);
      setBooks((prev) => prev.map((b) => (b.id === currentId ? finalBook : b)));
    } catch {
      const failedBook: Book = { ...book, extractionStatus: 'failed' };
      await replaceBook(currentId, failedBook);
      setBooks((prev) => prev.map((b) => (b.id === currentId ? failedBook : b)));
    }
  }

  async function importBook(): Promise<void> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: false,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    const isDuplicate = books.some((b) => b.filename === asset.name);
    if (isDuplicate) {
      Alert.alert('Already in library', `"${asset.name}" is already in your library.`);
      return;
    }

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
    await runExtraction(pendingId, pendingBook);
  }

  async function retryExtraction(bookId: string): Promise<void> {
    const book = books.find((b) => b.id === bookId);
    if (!book || book.extractionStatus === 'pending') return;

    const pendingBook: Book = { ...book, extractionStatus: 'pending' };
    await replaceBook(bookId, pendingBook);
    setBooks((prev) => prev.map((b) => (b.id === bookId ? pendingBook : b)));
    await runExtraction(bookId, pendingBook);
  }

  async function deleteBook(id: string): Promise<void> {
    const book = books.find((b) => b.id === id);
    if (!book) return;
    try {
      const file = new FSFile(book.path);
      if (file.exists) {
        file.delete();
      }
    } catch (e) {
      console.error('[deleteBook] file delete failed for path:', book.path, e);
      Alert.alert('Delete failed', "Couldn't delete the book");
      return;
    }
    await storageDeleteBook(id);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <LibraryContext.Provider value={{ books, importBook, deleteBook, retryExtraction }}>
      {children}
    </LibraryContext.Provider>
  );
}
```

- [ ] **Step 4: Run all LibraryContext tests**

```bash
npx jest __tests__/LibraryContext.test.tsx --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/context/LibraryContext.tsx __tests__/LibraryContext.test.tsx
git commit -m "feat: extract runExtraction helper and add retryExtraction to LibraryContext"
```

---

## Task 2: ReaderContainer — accept `activeView` prop, remove banner

**Files:**
- Modify: `src/components/reader/ReaderContainer.tsx`
- Test: `__tests__/ReaderContainer.test.tsx`

- [ ] **Step 1: Replace `__tests__/ReaderContainer.test.tsx` with updated tests**

The existing tests assert on banner text that will be removed, and don't pass `activeView`. Replace the file entirely:

```typescript
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
  it('renders ExtractedReader when activeView is reader and status is ready', () => {
    const { getByTestId } = render(
      <ReaderContainer book={baseBook} uri="/docs/test.pdf" activeView="reader" />
    );
    expect(getByTestId('extracted-reader')).toBeTruthy();
  });

  it('renders NativePdfViewer when activeView is pdf and status is ready', () => {
    const { getByTestId } = render(
      <ReaderContainer book={baseBook} uri="/docs/test.pdf" activeView="pdf" />
    );
    expect(getByTestId('native-viewer')).toBeTruthy();
  });

  it('renders NativePdfViewer when activeView is reader but status is pending', () => {
    const book: Book = { ...baseBook, extractionStatus: 'pending', extractionResult: undefined };
    const { getByTestId } = render(
      <ReaderContainer book={book} uri="/docs/test.pdf" activeView="reader" />
    );
    expect(getByTestId('native-viewer')).toBeTruthy();
  });

  it('renders NativePdfViewer when activeView is reader but status is failed', () => {
    const book: Book = { ...baseBook, extractionStatus: 'failed', extractionResult: undefined };
    const { getByTestId } = render(
      <ReaderContainer book={book} uri="/docs/test.pdf" activeView="reader" />
    );
    expect(getByTestId('native-viewer')).toBeTruthy();
  });

  it('renders NativePdfViewer when book is undefined', () => {
    const { getByTestId } = render(
      <ReaderContainer book={undefined} uri="/docs/test.pdf" activeView="pdf" />
    );
    expect(getByTestId('native-viewer')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/ReaderContainer.test.tsx --no-coverage
```

Expected: tests fail because `activeView` prop doesn't exist yet and banner text assertions break.

- [ ] **Step 3: Replace `src/components/reader/ReaderContainer.tsx`**

```typescript
import React from 'react';
import { Book } from '../../types';
import NativePdfViewer from './NativePdfViewer';
import ExtractedReader from './ExtractedReader';

type Props = {
  book: Book | undefined;
  uri: string | undefined;
  activeView: 'pdf' | 'reader';
};

export default function ReaderContainer({ book, uri, activeView }: Props) {
  if (activeView === 'reader' && book?.extractionStatus === 'ready' && book.extractionResult) {
    return <ExtractedReader result={book.extractionResult} />;
  }
  return <NativePdfViewer uri={uri} />;
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/ReaderContainer.test.tsx --no-coverage
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/reader/ReaderContainer.tsx __tests__/ReaderContainer.test.tsx
git commit -m "feat: replace ReaderContainer banner with activeView prop"
```

---

## Task 3: ReaderScreen — `activeView` state + header controls

**Files:**
- Modify: `app/reader.tsx`
- Test: `__tests__/ReaderScreen.test.tsx`

- [ ] **Step 1: Replace `__tests__/ReaderScreen.test.tsx` with updated tests**

```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ReaderScreen from '../app/reader';
import { useLibrary } from '../src/hooks/useLibrary';
import { Book } from '../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
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
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  },
}));

const makeBook = (overrides: Partial<Book> = {}): Book => ({
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
  ...overrides,
});

const mockRetryExtraction = jest.fn();

describe('ReaderScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the back button', () => {
    (useLibrary as jest.Mock).mockReturnValue({ books: [], retryExtraction: mockRetryExtraction });
    const { getByText } = render(<ReaderScreen />);
    expect(getByText('← Back')).toBeTruthy();
  });

  it('renders ReaderContainer', () => {
    (useLibrary as jest.Mock).mockReturnValue({ books: [], retryExtraction: mockRetryExtraction });
    const { getByTestId } = render(<ReaderScreen />);
    expect(getByTestId('reader-container')).toBeTruthy();
  });

  it('shows greyed toggle when extraction is pending', () => {
    const book = makeBook({ extractionStatus: 'pending', extractionResult: undefined });
    (useLibrary as jest.Mock).mockReturnValue({ books: [book], retryExtraction: mockRetryExtraction });
    const { getByLabelText } = render(<ReaderScreen />);
    expect(getByLabelText('Toggle view')).toBeTruthy();
  });

  it('does not show toggle when extraction has failed', () => {
    const book = makeBook({ extractionStatus: 'failed', extractionResult: undefined });
    (useLibrary as jest.Mock).mockReturnValue({ books: [book], retryExtraction: mockRetryExtraction });
    const { queryByLabelText } = render(<ReaderScreen />);
    expect(queryByLabelText('Toggle view')).toBeNull();
  });

  it('shows retry button when extraction has failed', () => {
    const book = makeBook({ extractionStatus: 'failed', extractionResult: undefined });
    (useLibrary as jest.Mock).mockReturnValue({ books: [book], retryExtraction: mockRetryExtraction });
    const { getByLabelText } = render(<ReaderScreen />);
    expect(getByLabelText('Retry extraction')).toBeTruthy();
  });

  it('does not show retry button when extraction is ready', () => {
    const book = makeBook();
    (useLibrary as jest.Mock).mockReturnValue({ books: [book], retryExtraction: mockRetryExtraction });
    const { queryByLabelText } = render(<ReaderScreen />);
    expect(queryByLabelText('Retry extraction')).toBeNull();
  });

  it('shows active toggle when extraction is ready', () => {
    const book = makeBook();
    (useLibrary as jest.Mock).mockReturnValue({ books: [book], retryExtraction: mockRetryExtraction });
    const { getByLabelText } = render(<ReaderScreen />);
    expect(getByLabelText('Toggle view')).toBeTruthy();
  });

  it('calls retryExtraction with bookId when retry is pressed', () => {
    const book = makeBook({ extractionStatus: 'failed', extractionResult: undefined });
    (useLibrary as jest.Mock).mockReturnValue({ books: [book], retryExtraction: mockRetryExtraction });
    const { getByLabelText } = render(<ReaderScreen />);
    fireEvent.press(getByLabelText('Retry extraction'));
    expect(mockRetryExtraction).toHaveBeenCalledWith('book-1');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/ReaderScreen.test.tsx --no-coverage
```

Expected: new tests fail — header icons don't exist yet.

- [ ] **Step 3: Replace `app/reader.tsx`**

```typescript
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLibrary } from '../src/hooks/useLibrary';
import ReaderContainer from '../src/components/reader/ReaderContainer';

type ActiveView = 'pdf' | 'reader';

export default function ReaderScreen() {
  const { bookId, uri } = useLocalSearchParams<{ bookId: string; uri: string }>();
  const { books, retryExtraction } = useLibrary();
  const insets = useSafeAreaInsets();
  const book = books.find((b) => b.id === bookId);

  const [activeView, setActiveView] = useState<ActiveView>(
    book?.extractionStatus === 'ready' ? 'reader' : 'pdf'
  );

  const canToggle = book?.extractionStatus === 'ready';
  const canRetry = book?.extractionStatus === 'failed';
  const isPending = book?.extractionStatus === 'pending';

  function handleToggle() {
    setActiveView((v) => (v === 'reader' ? 'pdf' : 'reader'));
  }

  async function handleRetry() {
    if (bookId) await retryExtraction(bookId);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {canRetry && (
            <TouchableOpacity
              onPress={handleRetry}
              style={styles.headerIcon}
              accessibilityLabel="Retry extraction"
            >
              <Ionicons name="refresh-outline" size={22} color="#111" />
            </TouchableOpacity>
          )}
          {(canToggle || isPending) && (
            <TouchableOpacity
              onPress={canToggle ? handleToggle : undefined}
              style={[styles.headerIcon, !canToggle && styles.headerIconDisabled]}
              accessibilityLabel="Toggle view"
            >
              <Ionicons
                name={activeView === 'reader' ? 'document-outline' : 'document-text-outline'}
                size={22}
                color={canToggle ? '#111' : '#ccc'}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <ReaderContainer book={book} uri={uri} activeView={activeView} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  backButton: { fontSize: 16, color: '#111' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { padding: 4 },
  headerIconDisabled: { opacity: 0.4 },
});
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/ReaderScreen.test.tsx --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/reader.tsx __tests__/ReaderScreen.test.tsx
git commit -m "feat: add view toggle and retry button to reader header"
```

---

## Task 4: LibraryScreen — status icons + retry from row

**Files:**
- Modify: `app/index.tsx`
- Test: `__tests__/LibraryScreen.test.tsx`

- [ ] **Step 1: Replace `__tests__/LibraryScreen.test.tsx` with updated tests**

```typescript
import React from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import LibraryScreen from '../app/index';
import { useLibrary } from '../src/hooks/useLibrary';
import { Book } from '../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../src/hooks/useLibrary');
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));
jest.mock('react-native-gesture-handler', () => ({
  Swipeable: ({ children, renderRightActions }: any) => (
    <>
      {children}
      {renderRightActions?.()}
    </>
  ),
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  },
}));

const mockImportBook = jest.fn();
const mockDeleteBook = jest.fn();
const mockRetryExtraction = jest.fn();

const makeBook = (overrides: Partial<Book> = {}): Book => ({
  id: '1',
  filename: 'test.pdf',
  path: '/docs/test.pdf',
  addedAt: '2026-05-09T00:00:00.000Z',
  extractionStatus: 'ready',
  ...overrides,
});

describe('LibraryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLibrary as jest.Mock).mockReturnValue({
      books: [],
      importBook: mockImportBook,
      deleteBook: mockDeleteBook,
      retryExtraction: mockRetryExtraction,
    });
  });

  it('shows empty state message when no books exist', () => {
    const { getByText } = render(<LibraryScreen />);
    expect(getByText('No PDFs yet. Tap + to import one.')).toBeTruthy();
  });

  it('renders book filenames when books exist', () => {
    (useLibrary as jest.Mock).mockReturnValue({
      books: [makeBook({ filename: 'annual-report.pdf' })],
      importBook: mockImportBook,
      deleteBook: mockDeleteBook,
      retryExtraction: mockRetryExtraction,
    });
    const { getByText } = render(<LibraryScreen />);
    expect(getByText('annual-report.pdf')).toBeTruthy();
  });

  it('calls importBook when FAB is pressed', () => {
    const { getByLabelText } = render(<LibraryScreen />);
    fireEvent.press(getByLabelText('Import PDF'));
    expect(mockImportBook).toHaveBeenCalledTimes(1);
  });

  it('navigates to reader with the book URI when a book is tapped', () => {
    const { router } = require('expo-router');
    const book = makeBook();
    (useLibrary as jest.Mock).mockReturnValue({
      books: [book],
      importBook: mockImportBook,
      deleteBook: mockDeleteBook,
      retryExtraction: mockRetryExtraction,
    });
    const { getByText } = render(<LibraryScreen />);
    fireEvent.press(getByText('test.pdf'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/reader',
      params: { bookId: book.id, uri: book.path },
    });
  });

  it('shows delete confirmation alert when delete action is pressed', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const book = makeBook();
    (useLibrary as jest.Mock).mockReturnValue({
      books: [book],
      importBook: mockImportBook,
      deleteBook: mockDeleteBook,
      retryExtraction: mockRetryExtraction,
    });
    const { getByText } = render(<LibraryScreen />);
    fireEvent.press(getByText('Delete'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete "test.pdf"?',
      'This cannot be undone.',
      expect.any(Array)
    );
  });

  it('calls deleteBook with the book id when delete is confirmed', () => {
    jest.spyOn(Alert, 'alert');
    const book = makeBook();
    (useLibrary as jest.Mock).mockReturnValue({
      books: [book],
      importBook: mockImportBook,
      deleteBook: mockDeleteBook,
      retryExtraction: mockRetryExtraction,
    });
    const { getByText } = render(<LibraryScreen />);
    fireEvent.press(getByText('Delete'));
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const deleteButton = buttons.find((b: any) => b.text === 'Delete');
    deleteButton.onPress();
    expect(mockDeleteBook).toHaveBeenCalledWith('1');
  });

  it('shows spinner for pending book', () => {
    (useLibrary as jest.Mock).mockReturnValue({
      books: [makeBook({ extractionStatus: 'pending' })],
      importBook: mockImportBook,
      deleteBook: mockDeleteBook,
      retryExtraction: mockRetryExtraction,
    });
    const { UNSAFE_getByType } = render(<LibraryScreen />);
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('shows retry icon for failed book', () => {
    (useLibrary as jest.Mock).mockReturnValue({
      books: [makeBook({ extractionStatus: 'failed' })],
      importBook: mockImportBook,
      deleteBook: mockDeleteBook,
      retryExtraction: mockRetryExtraction,
    });
    const { getByLabelText } = render(<LibraryScreen />);
    expect(getByLabelText('Retry extraction')).toBeTruthy();
  });

  it('shows no status icon for ready book', () => {
    (useLibrary as jest.Mock).mockReturnValue({
      books: [makeBook({ extractionStatus: 'ready' })],
      importBook: mockImportBook,
      deleteBook: mockDeleteBook,
      retryExtraction: mockRetryExtraction,
    });
    const { queryByLabelText, UNSAFE_queryByType } = render(<LibraryScreen />);
    expect(queryByLabelText('Retry extraction')).toBeNull();
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  });

  it('calls retryExtraction with book id when retry icon is pressed', () => {
    (useLibrary as jest.Mock).mockReturnValue({
      books: [makeBook({ id: '1', extractionStatus: 'failed' })],
      importBook: mockImportBook,
      deleteBook: mockDeleteBook,
      retryExtraction: mockRetryExtraction,
    });
    const { getByLabelText } = render(<LibraryScreen />);
    fireEvent.press(getByLabelText('Retry extraction'));
    expect(mockRetryExtraction).toHaveBeenCalledWith('1');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/LibraryScreen.test.tsx --no-coverage
```

Expected: new status icon tests fail — icons don't exist yet.

- [ ] **Step 3: Replace `app/index.tsx`**

```typescript
import React, { useRef } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useLibrary } from '../src/hooks/useLibrary';
import { Book } from '../src/types';

function BookStatusIcon({ book, onRetry }: { book: Book; onRetry: () => void }) {
  if (book.extractionStatus === 'pending') {
    return <ActivityIndicator size="small" color="#9CA3AF" style={styles.statusIcon} />;
  }
  if (book.extractionStatus === 'failed') {
    return (
      <TouchableOpacity onPress={onRetry} accessibilityLabel="Retry extraction" style={styles.statusIcon}>
        <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
      </TouchableOpacity>
    );
  }
  return null;
}

function BookRow({ book, onPress, onDelete, onRetry }: { book: Book; onPress: () => void; onDelete: () => void; onRetry: () => void }) {
  const swipeableRef = useRef<Swipeable>(null);

  function handleDelete() {
    Alert.alert(
      `Delete "${book.filename}"?`,
      'This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => swipeableRef.current?.close(),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            swipeableRef.current?.close();
            void onDelete();
          },
        },
      ]
    );
  }

  function renderRightActions() {
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={handleDelete}>
        <Text style={styles.deleteActionText}>Delete</Text>
      </TouchableOpacity>
    );
  }

  return (
    <Swipeable ref={swipeableRef} renderRightActions={renderRightActions}>
      <TouchableOpacity style={styles.bookItem} onPress={onPress}>
        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle}>{book.filename}</Text>
          <Text style={styles.bookDate}>{new Date(book.addedAt).toLocaleDateString()}</Text>
        </View>
        <BookStatusIcon book={book} onRetry={onRetry} />
      </TouchableOpacity>
    </Swipeable>
  );
}

export default function LibraryScreen() {
  const { books, importBook, deleteBook, retryExtraction } = useLibrary();

  function handleBookPress(book: Book) {
    router.push({ pathname: '/reader', params: { bookId: book.id, uri: book.path } });
  }

  return (
    <SafeAreaView style={styles.container}>
      {books.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No PDFs yet. Tap + to import one.</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 80 }}
          renderItem={({ item }) => (
            <BookRow
              book={item}
              onPress={() => handleBookPress(item)}
              onDelete={() => deleteBook(item.id)}
              onRetry={() => retryExtraction(item.id)}
            />
          )}
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={importBook} accessibilityLabel="Import PDF">
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  bookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  bookDate: { fontSize: 12, color: '#888', marginTop: 2 },
  statusIcon: { marginLeft: 12 },
  deleteAction: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  deleteActionText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32 },
});
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/LibraryScreen.test.tsx --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/index.tsx __tests__/LibraryScreen.test.tsx
git commit -m "feat: add extraction status icons and retry to library rows"
```
