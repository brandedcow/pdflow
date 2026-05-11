import React from 'react';
import { render } from '@testing-library/react-native';
import ReaderScreen from '../app/reader';
import { useLibrary } from '../src/hooks/useLibrary';

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

describe('ReaderScreen', () => {
  it('renders the back button', () => {
    (useLibrary as jest.Mock).mockReturnValue({ books: [], importBook: jest.fn() });
    const { getByText } = render(<ReaderScreen />);
    expect(getByText('← Back')).toBeTruthy();
  });

  it('renders ReaderContainer', () => {
    (useLibrary as jest.Mock).mockReturnValue({ books: [], importBook: jest.fn() });
    const { getByTestId } = render(<ReaderScreen />);
    expect(getByTestId('reader-container')).toBeTruthy();
  });
});
