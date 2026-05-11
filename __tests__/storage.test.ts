import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveBook, loadBooks, replaceBook, deleteBook } from '../src/storage/storage';
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
