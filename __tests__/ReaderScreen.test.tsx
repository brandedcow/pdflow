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
