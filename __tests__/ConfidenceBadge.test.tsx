import React from 'react';
import { render } from '@testing-library/react-native';
import ConfidenceBadge from '../src/components/reader/ConfidenceBadge';

describe('ConfidenceBadge', () => {
  it('shows "High confidence" for score >= 0.8', () => {
    const { getByText } = render(<ConfidenceBadge overallConfidence={0.92} />);
    expect(getByText(/High confidence/i)).toBeTruthy();
  });

  it('shows "Partial confidence" for score between 0.5 and 0.79', () => {
    const { getByText } = render(<ConfidenceBadge overallConfidence={0.65} />);
    expect(getByText(/Partial confidence/i)).toBeTruthy();
  });

  it('renders green badge for high confidence', () => {
    const { getByTestId } = render(<ConfidenceBadge overallConfidence={0.9} />);
    expect(getByTestId('confidence-badge').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: '#10B981' })])
    );
  });

  it('renders amber badge for partial confidence', () => {
    const { getByTestId } = render(<ConfidenceBadge overallConfidence={0.6} />);
    expect(getByTestId('confidence-badge').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: '#F59E0B' })])
    );
  });
});
