# Delete Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to swipe left on any library row to reveal a red "Delete" button that, after confirmation, removes the book from state, AsyncStorage, and the device filesystem.

**Architecture:** Add `deleteBook(id)` to the storage layer (AsyncStorage only), then add `deleteBook(id)` to `LibraryContext` (filesystem + storage + state), then update `LibraryScreen` to wrap each row in `Swipeable` with a delete action button and confirmation `Alert`. A `BookRow` sub-component owns the `Swipeable` ref.

**Tech Stack:** React Native, `react-native-gesture-handler` (Swipeable — already bundled with Expo), `expo-file-system/legacy` (deleteAsync), `@react-native-async-storage/async-storage`, Jest + `@testing-library/react-native`

---

## File Map

| File | Change |
|------|--------|
| `src/storage/storage.ts` | Add `deleteBook(id)` export |
| `src/context/LibraryContext.tsx` | Add `deleteBook(id)` to type + provider |
| `app/index.tsx` | Extract `BookRow`, add `Swipeable` + delete action |
| `__tests__/storage.test.ts` | Add `deleteBook` describe block |
| `__tests__/LibraryContext.test.tsx` | Add `deleteAsync` to FileSystem mock + `deleteBook` tests |
| `__tests__/LibraryScreen.test.tsx` | Mock `Swipeable`, add `deleteBook` to hook mock, add delete UI test |

---

### Task 1: Add `deleteBook` to storage layer

**Files:**
- Modify: `src/storage/storage.ts`
- Modify: `__tests__/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this `describe` block to `__tests__/storage.test.ts`. Also add `deleteBook` to the import on line 2:

```typescript
// Line 2 — update import:
import { saveBook, loadBooks, replaceBook, deleteBook } from '../src/storage/storage';

// Append at end of file:
describe('deleteBook', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('removes the book with the given id', async () => {
    await saveBook(mockBook);
    await deleteBook('test-id-1');
    const books = await loadBooks();
    expect(books).toEqual([]);
  });

  it('leaves other books intact', async () => {
    const second: Book = { ...mockBook, id: 'test-id-2', filename: 'second.pdf' };
    await saveBook(mockBook);
    await saveBook(second);
    await deleteBook('test-id-1');
    const books = await loadBooks();
    expect(books).toHaveLength(1);
    expect(books[0].id).toBe('test-id-2');
  });

  it('does nothing if id is not found', async () => {
    await saveBook(mockBook);
    await deleteBook('ghost-id');
    const books = await loadBooks();
    expect(books).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```
npx jest __tests__/storage.test.ts --no-coverage
```

Expected: 3 failures — `deleteBook is not a function`

- [ ] **Step 3: Implement `deleteBook` in storage**

Append to `src/storage/storage.ts`:

```typescript
export async function deleteBook(id: string): Promise<void> {
  const existing = await loadBooks();
  const updated = existing.filter((b) => b.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx jest __tests__/storage.test.ts --no-coverage
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/storage/storage.ts __tests__/storage.test.ts
git commit -m "feat: add deleteBook to storage layer"
```

---

### Task 2: Add `deleteBook` to LibraryContext

**Files:**
- Modify: `src/context/LibraryContext.tsx`
- Modify: `__tests__/LibraryContext.test.tsx`

- [ ] **Step 1: Add `deleteAsync` to the FileSystem mock and write failing tests**

In `__tests__/LibraryContext.test.tsx`:

1. Update the `expo-file-system/legacy` mock (around line 16) to include `deleteAsync`:

```typescript
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/documents/',
  copyAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));
```

2. Append this `describe` block inside the outer `describe('LibraryContext', ...)`, after the last `it(...)`:

```typescript
describe('deleteBook', () => {
  const storedBook = {
    id: 'stored-id',
    filename: 'stored.pdf',
    path: '/mock/documents/pdfs/stored.pdf',
    addedAt: '2026-05-09T00:00:00.000Z',
    extractionStatus: 'ready' as const,
  };

  it('removes the book from state and storage', async () => {
    await AsyncStorage.setItem('pdflow_books', JSON.stringify([storedBook]));
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {});

    await act(async () => {
      await result.current.deleteBook('stored-id');
    });

    expect(result.current.books).toHaveLength(0);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      '/mock/documents/pdfs/stored.pdf',
      { idempotent: true }
    );
  });

  it('shows alert and does not remove book if filesystem delete throws', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    (FileSystem.deleteAsync as jest.Mock).mockRejectedValue(new Error('Permission denied'));
    await AsyncStorage.setItem('pdflow_books', JSON.stringify([storedBook]));

    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {});

    await act(async () => {
      await result.current.deleteBook('stored-id');
    });

    expect(alertSpy).toHaveBeenCalledWith('Delete failed', "Couldn't delete the book");
    expect(result.current.books).toHaveLength(1);
  });

  it('does nothing if book id is not found', async () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {});

    await act(async () => {
      await result.current.deleteBook('non-existent-id');
    });

    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    expect(result.current.books).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```
npx jest __tests__/LibraryContext.test.tsx --no-coverage
```

Expected: 3 new failures — `result.current.deleteBook is not a function`

- [ ] **Step 3: Implement `deleteBook` in LibraryContext**

Replace the full contents of `src/context/LibraryContext.tsx` with:

```typescript
import React, { createContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Book, ExtractionStatus } from '../types';
import { loadBooks, saveBook, replaceBook, deleteBook as storageDeleteBook } from '../storage/storage';
import { extractPdf } from '../api/extractionApi';

type LibraryContextType = {
  books: Book[];
  importBook: () => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
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

  async function deleteBook(id: string): Promise<void> {
    const book = books.find((b) => b.id === id);
    if (!book) return;
    try {
      await FileSystem.deleteAsync(book.path, { idempotent: true });
    } catch {
      Alert.alert('Delete failed', "Couldn't delete the book");
      return;
    }
    await storageDeleteBook(id);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <LibraryContext.Provider value={{ books, importBook, deleteBook }}>
      {children}
    </LibraryContext.Provider>
  );
}
```

- [ ] **Step 4: Run the full test suite to confirm all tests pass**

```
npx jest --no-coverage
```

Expected: all tests pass, including the 3 new `deleteBook` tests

- [ ] **Step 5: Commit**

```bash
git add src/context/LibraryContext.tsx __tests__/LibraryContext.test.tsx
git commit -m "feat: add deleteBook to LibraryContext"
```

---

### Task 3: Wire up swipe-to-delete in LibraryScreen

**Files:**
- Modify: `app/index.tsx`
- Modify: `__tests__/LibraryScreen.test.tsx`

- [ ] **Step 1: Update the screen test**

Replace the full contents of `__tests__/LibraryScreen.test.tsx` with:

```typescript
import React from 'react';
import { Alert } from 'react-native';
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

const mockImportBook = jest.fn();
const mockDeleteBook = jest.fn();

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
  });

  it('shows empty state message when no books exist', () => {
    (useLibrary as jest.Mock).mockReturnValue({ books: [], importBook: mockImportBook, deleteBook: mockDeleteBook });
    const { getByText } = render(<LibraryScreen />);
    expect(getByText('No PDFs yet. Tap + to import one.')).toBeTruthy();
  });

  it('renders book filenames when books exist', () => {
    const books = [makeBook({ filename: 'annual-report.pdf' })];
    (useLibrary as jest.Mock).mockReturnValue({ books, importBook: mockImportBook, deleteBook: mockDeleteBook });
    const { getByText } = render(<LibraryScreen />);
    expect(getByText('annual-report.pdf')).toBeTruthy();
  });

  it('calls importBook when FAB is pressed', () => {
    (useLibrary as jest.Mock).mockReturnValue({ books: [], importBook: mockImportBook, deleteBook: mockDeleteBook });
    const { getByLabelText } = render(<LibraryScreen />);
    fireEvent.press(getByLabelText('Import PDF'));
    expect(mockImportBook).toHaveBeenCalledTimes(1);
  });

  it('navigates to reader with the book URI when a book is tapped', () => {
    const { router } = require('expo-router');
    const book = makeBook();
    (useLibrary as jest.Mock).mockReturnValue({ books: [book], importBook: mockImportBook, deleteBook: mockDeleteBook });
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
    (useLibrary as jest.Mock).mockReturnValue({ books: [book], importBook: mockImportBook, deleteBook: mockDeleteBook });
    const { getByText } = render(<LibraryScreen />);
    fireEvent.press(getByText('Delete'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete "test.pdf"?',
      'This cannot be undone.',
      expect.any(Array)
    );
  });
});
```

- [ ] **Step 2: Run to confirm the new test fails**

```
npx jest __tests__/LibraryScreen.test.tsx --no-coverage
```

Expected: 4 existing tests pass, 1 new test fails (`getByText('Delete')` not found)

- [ ] **Step 3: Implement the UI**

Replace the full contents of `app/index.tsx` with:

```typescript
import React, { useRef } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { useLibrary } from '../src/hooks/useLibrary';
import { Book } from '../src/types';

function BookRow({ book, onPress }: { book: Book; onPress: () => void }) {
  const swipeableRef = useRef<Swipeable>(null);
  const { deleteBook } = useLibrary();

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
            deleteBook(book.id);
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
        <Text style={styles.bookTitle}>{book.filename}</Text>
        <Text style={styles.bookDate}>{new Date(book.addedAt).toLocaleDateString()}</Text>
      </TouchableOpacity>
    </Swipeable>
  );
}

export default function LibraryScreen() {
  const { books, importBook } = useLibrary();

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
            <BookRow book={item} onPress={() => handleBookPress(item)} />
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  bookTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  bookDate: { fontSize: 12, color: '#888', marginTop: 2 },
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

- [ ] **Step 4: Run the full test suite**

```
npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 5: Type check**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add app/index.tsx __tests__/LibraryScreen.test.tsx
git commit -m "feat: swipe-to-delete books in library screen"
```
