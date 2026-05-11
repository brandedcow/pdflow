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
