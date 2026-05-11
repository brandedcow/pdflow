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
