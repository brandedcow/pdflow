import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LibraryProvider } from '../src/context/LibraryContext';
import { useLibrary } from '../src/hooks/useLibrary';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-document-picker');
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/documents/',
  copyAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mock-uuid'),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LibraryProvider>{children}</LibraryProvider>
);

describe('LibraryContext', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('starts with an empty book list', async () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {});
    expect(result.current.books).toEqual([]);
  });

  it('loads persisted books from storage on mount', async () => {
    const stored = {
      id: 'stored-id',
      filename: 'stored.pdf',
      path: '/mock/documents/pdfs/stored.pdf',
      addedAt: '2026-05-09T00:00:00.000Z',
    };
    await AsyncStorage.setItem('pdflow_books', JSON.stringify([stored]));
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {});
    expect(result.current.books).toEqual([stored]);
  });

  it('importBook does nothing when picker is cancelled', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true });
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {
      await result.current.importBook();
    });
    expect(result.current.books).toHaveLength(0);
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it('importBook adds a book when picker succeeds', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: '/tmp/test.pdf', name: 'test.pdf' }],
    });
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {
      await result.current.importBook();
    });
    expect(result.current.books).toHaveLength(1);
    expect(result.current.books[0]).toMatchObject({
      id: 'mock-uuid',
      filename: 'test.pdf',
      path: '/mock/documents/pdfs/mock-uuid-test.pdf',
    });
    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      '/mock/documents/pdfs/',
      { intermediates: true }
    );
  });

  it('importBook shows an alert and does not add a book when copy fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: '/tmp/test.pdf', name: 'test.pdf' }],
    });
    (FileSystem.copyAsync as jest.Mock).mockRejectedValue(new Error('Storage full'));
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {
      await result.current.importBook();
    });
    expect(alertSpy).toHaveBeenCalledWith('Import failed', "Couldn't import file");
    expect(result.current.books).toHaveLength(0);
    // saveBook should not have been called — no orphaned AsyncStorage records
    const stored = await AsyncStorage.getItem('pdflow_books');
    expect(stored).toBeNull();
  });
});
