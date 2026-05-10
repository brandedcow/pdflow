import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import ReaderScreen from '../app/reader';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ uri: '/documents/pdfs/test.pdf' }),
  router: { back: jest.fn() },
}));

let capturedOnError: ((error: object) => void) | null = null;

jest.mock('react-native-pdf', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ onError, style }: { onError: (error: object) => void; style: object }) => {
      capturedOnError = onError;
      return React.createElement(View, { testID: 'pdf-viewer', style });
    },
  };
});

describe('ReaderScreen', () => {
  let routerBack: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnError = null;
    const { router } = require('expo-router');
    routerBack = router.back as jest.Mock;
  });

  it('renders the PDF viewer', () => {
    const { getByTestId } = render(<ReaderScreen />);
    expect(getByTestId('pdf-viewer')).toBeTruthy();
  });

  it('renders the back button', () => {
    const { getByText } = render(<ReaderScreen />);
    expect(getByText('← Back')).toBeTruthy();
  });

  it('navigates back when the back button is pressed', () => {
    const { getByText } = render(<ReaderScreen />);
    fireEvent.press(getByText('← Back'));
    expect(routerBack).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when the PDF fails to load', async () => {
    const { getByText } = render(<ReaderScreen />);
    await act(async () => {
      capturedOnError?.({}as any);
    });
    expect(getByText('Could not open this PDF.')).toBeTruthy();
    expect(getByText('Go back')).toBeTruthy();
  });

  it('navigates back from the error state', async () => {
    const { getByText } = render(<ReaderScreen />);
    await act(async () => {
      capturedOnError?.({}as any);
    });
    fireEvent.press(getByText('Go back'));
    expect(routerBack).toHaveBeenCalledTimes(1);
  });
});
