import React, { useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ReaderSettings, { ReaderConfig, FONT_SIZES, BACKGROUNDS } from '../src/components/reader/ReaderSettings';

function Wrapper() {
  const [config, setConfig] = useState<ReaderConfig>({
    fontSize: 16,
    background: BACKGROUNDS[0],
  });
  return <ReaderSettings config={config} onChange={setConfig} />;
}

describe('ReaderSettings', () => {
  it('renders font size options', () => {
    const { getByText } = render(<Wrapper />);
    FONT_SIZES.forEach(({ label }) => {
      expect(getByText(label)).toBeTruthy();
    });
  });

  it('renders background colour options', () => {
    const { getByText } = render(<Wrapper />);
    BACKGROUNDS.forEach(({ label }) => {
      expect(getByText(label)).toBeTruthy();
    });
  });

  it('calls onChange with new font size when option tapped', () => {
    const onChange = jest.fn();
    const config: ReaderConfig = { fontSize: 16, background: BACKGROUNDS[0] };
    const { getByText } = render(<ReaderSettings config={config} onChange={onChange} />);
    fireEvent.press(getByText('XL'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 22 }));
  });

  it('calls onChange with new background when option tapped', () => {
    const onChange = jest.fn();
    const config: ReaderConfig = { fontSize: 16, background: BACKGROUNDS[0] };
    const { getByText } = render(<ReaderSettings config={config} onChange={onChange} />);
    fireEvent.press(getByText('Sepia'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ background: expect.objectContaining({ label: 'Sepia' }) })
    );
  });
});
