import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { File as FSFile } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LibraryProvider } from '../src/context/LibraryContext';
import { useLibrary } from '../src/hooks/useLibrary';
import { extractPdf } from '../src/api/extractionApi';
import { ExtractionResult } from '../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-document-picker');
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/documents/',
  copyAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mock-pending-uuid'),
}));
jest.mock('../src/api/extractionApi');

const mockExtractionResult: ExtractionResult = {
  book_id: 'backend-book-uuid',
  status: 'success',
  overall_confidence: 0.92,
  page_count: 3,
  blocks: [{ type: 'text', content: 'Hello', page: 1, confidence: 0.92 }],
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LibraryProvider>{children}</LibraryProvider>
);

let mockFileInstance: { exists: boolean; delete: jest.Mock; move: jest.Mock };

describe('LibraryContext', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    mockFileInstance = { exists: true, delete: jest.fn(), move: jest.fn() };
    (FSFile as jest.Mock).mockImplementation(() => mockFileInstance);
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
      extractionStatus: 'ready',
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

  it('importBook adds book with pending status immediately then updates to ready', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: '/tmp/test.pdf', name: 'test.pdf' }],
    });
    (extractPdf as jest.Mock).mockResolvedValue(mockExtractionResult);

    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {
      await result.current.importBook();
    });

    expect(result.current.books).toHaveLength(1);
    expect(result.current.books[0].id).toBe('backend-book-uuid');
    expect(result.current.books[0].extractionStatus).toBe('ready');
    expect(result.current.books[0].extractionResult).toEqual(mockExtractionResult);
  });

  it('importBook uses backend book_id as final Book.id', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: '/tmp/test.pdf', name: 'test.pdf' }],
    });
    (extractPdf as jest.Mock).mockResolvedValue(mockExtractionResult);

    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {
      await result.current.importBook();
    });

    expect(result.current.books[0].id).toBe('backend-book-uuid');
  });

  it('importBook sets extractionStatus to failed when backend is offline', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: '/tmp/test.pdf', name: 'test.pdf' }],
    });
    (extractPdf as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {
      await result.current.importBook();
    });

    expect(result.current.books).toHaveLength(1);
    expect(result.current.books[0].extractionStatus).toBe('failed');
    expect(result.current.books[0].id).toBe('mock-pending-uuid');
  });

  it('importBook shows alert and adds no book when file copy fails', async () => {
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
  });

  it('importBook shows alert and does not import when filename already exists', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const existingBook = {
      id: 'existing-id',
      filename: 'test.pdf',
      path: '/mock/documents/pdfs/existing-id-test.pdf',
      addedAt: '2026-05-11T00:00:00.000Z',
      extractionStatus: 'ready' as const,
    };
    await AsyncStorage.setItem('pdflow_books', JSON.stringify([existingBook]));

    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: '/tmp/test.pdf', name: 'test.pdf' }],
    });

    const { result } = renderHook(() => useLibrary(), { wrapper });
    await act(async () => {});

    await act(async () => {
      await result.current.importBook();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Already in library',
      '"test.pdf" is already in your library.'
    );
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
    expect(result.current.books).toHaveLength(1);
  });

  describe('deleteBook', () => {
    const storedBook = {
      id: 'stored-id',
      filename: 'stored.pdf',
      path: '/mock/documents/pdfs/stored.pdf',
      addedAt: '2026-05-09T00:00:00.000Z',
      extractionStatus: 'ready' as const,
    };

    it('removes the book from state and storage', async () => {
      await AsyncStorage.setItem('pdflow_books', JSON.stringify([storedBook]));
      const { result } = renderHook(() => useLibrary(), { wrapper });
      await act(async () => {});

      await act(async () => {
        await result.current.deleteBook('stored-id');
      });

      expect(result.current.books).toHaveLength(0);
      expect(FSFile).toHaveBeenCalledWith('/mock/documents/pdfs/stored.pdf');
      expect(mockFileInstance.delete).toHaveBeenCalled();
      const raw = await AsyncStorage.getItem('pdflow_books');
      expect(JSON.parse(raw!)).toHaveLength(0);
    });

    it('shows alert and does not remove book if filesystem delete throws', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      mockFileInstance.delete.mockImplementation(() => { throw new Error('not writable'); });
      await AsyncStorage.setItem('pdflow_books', JSON.stringify([storedBook]));

      const { result } = renderHook(() => useLibrary(), { wrapper });
      await act(async () => {});

      await act(async () => {
        await result.current.deleteBook('stored-id');
      });

      expect(alertSpy).toHaveBeenCalledWith('Delete failed', "Couldn't delete the book");
      expect(result.current.books).toHaveLength(1);
    });

    it('does nothing if book id is not found', async () => {
      const { result } = renderHook(() => useLibrary(), { wrapper });
      await act(async () => {});

      await act(async () => {
        await result.current.deleteBook('non-existent-id');
      });

      expect(mockFileInstance.delete).not.toHaveBeenCalled();
      expect(result.current.books).toHaveLength(0);
    });
  });

  describe('retryExtraction', () => {
    const failedBook = {
      id: 'failed-id',
      filename: 'test.pdf',
      path: '/mock/documents/pdfs/failed-id-test.pdf',
      addedAt: '2026-05-11T00:00:00.000Z',
      extractionStatus: 'failed' as const,
    };

    it('sets status to pending then ready on success', async () => {
      await AsyncStorage.setItem('pdflow_books', JSON.stringify([failedBook]));
      (extractPdf as jest.Mock).mockResolvedValue(mockExtractionResult);

      const { result } = renderHook(() => useLibrary(), { wrapper });
      await act(async () => {});

      await act(async () => {
        await result.current.retryExtraction('failed-id');
      });

      expect(result.current.books[0].id).toBe('backend-book-uuid');
      expect(result.current.books[0].extractionStatus).toBe('ready');
      expect(result.current.books[0].extractionResult).toEqual(mockExtractionResult);
    });

    it('sets status back to failed when extraction throws', async () => {
      await AsyncStorage.setItem('pdflow_books', JSON.stringify([failedBook]));
      (extractPdf as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useLibrary(), { wrapper });
      await act(async () => {});

      await act(async () => {
        await result.current.retryExtraction('failed-id');
      });

      expect(result.current.books[0].extractionStatus).toBe('failed');
    });

    it('is a no-op when book is already pending', async () => {
      const pendingBook = { ...failedBook, id: 'pending-id', extractionStatus: 'pending' as const };
      await AsyncStorage.setItem('pdflow_books', JSON.stringify([pendingBook]));

      const { result } = renderHook(() => useLibrary(), { wrapper });
      await act(async () => {});

      await act(async () => {
        await result.current.retryExtraction('pending-id');
      });

      expect(extractPdf).not.toHaveBeenCalled();
      expect(result.current.books[0].extractionStatus).toBe('pending');
    });

    it('is a no-op when book id is not found', async () => {
      const { result } = renderHook(() => useLibrary(), { wrapper });
      await act(async () => {});

      await act(async () => {
        await result.current.retryExtraction('nonexistent-id');
      });

      expect(extractPdf).not.toHaveBeenCalled();
    });
  });
});
