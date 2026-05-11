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

  it('calls deleteBook with the book id when delete is confirmed', () => {
    jest.spyOn(Alert, 'alert');
    const book = makeBook();
    (useLibrary as jest.Mock).mockReturnValue({ books: [book], importBook: mockImportBook, deleteBook: mockDeleteBook });
    const { getByText } = render(<LibraryScreen />);
    fireEvent.press(getByText('Delete'));

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const deleteButton = buttons.find((b: any) => b.text === 'Delete');
    deleteButton.onPress();

    expect(mockDeleteBook).toHaveBeenCalledWith('1');
  });
});
