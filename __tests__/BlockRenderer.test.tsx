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
