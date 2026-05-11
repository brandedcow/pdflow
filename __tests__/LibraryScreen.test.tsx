import React from 'react';
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

const mockImportBook = jest.fn();

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
    (useLibrary as jest.Mock).mockReturnValue({ books: [], importBook: mockImportBook });
    const { getByText } = render(<LibraryScreen />);
    expect(getByText('No PDFs yet. Tap + to import one.')).toBeTruthy();
  });

  it('renders book filenames when books exist', () => {
    const books = [makeBook({ filename: 'annual-report.pdf' })];
    (useLibrary as jest.Mock).mockReturnValue({ books, importBook: mockImportBook });
    const { getByText } = render(<LibraryScreen />);
    expect(getByText('annual-report.pdf')).toBeTruthy();
  });

  it('calls importBook when FAB is pressed', () => {
    (useLibrary as jest.Mock).mockReturnValue({ books: [], importBook: mockImportBook });
    const { getByLabelText } = render(<LibraryScreen />);
    fireEvent.press(getByLabelText('Import PDF'));
    expect(mockImportBook).toHaveBeenCalledTimes(1);
  });

  it('navigates to reader with the book URI when a book is tapped', () => {
    const { router } = require('expo-router');
    const book = makeBook();
    (useLibrary as jest.Mock).mockReturnValue({ books: [book], importBook: mockImportBook });
    const { getByText } = render(<LibraryScreen />);
    fireEvent.press(getByText('test.pdf'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/reader',
      params: { bookId: book.id, uri: book.path },
    });
  });
});
