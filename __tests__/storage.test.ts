import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveBook, loadBooks } from '../src/storage/storage';
import { Book } from '../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockBook: Book = {
  id: 'test-id-1',
  filename: 'test.pdf',
  path: '/documents/pdfs/test.pdf',
  addedAt: '2026-05-09T00:00:00.000Z',
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
