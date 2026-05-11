import React, { createContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Book, ExtractionStatus } from '../types';
import { loadBooks, saveBook, replaceBook } from '../storage/storage';
import { extractPdf } from '../api/extractionApi';

type LibraryContextType = {
  books: Book[];
  importBook: () => Promise<void>;
};

export const LibraryContext = createContext<LibraryContextType | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    loadBooks().then(setBooks);
  }, []);

  async function importBook(): Promise<void> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: false,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    const pendingId = Crypto.randomUUID();
    const destDir = `${FileSystem.documentDirectory}pdfs/`;
    const pendingPath = `${destDir}${pendingId}-${asset.name}`;

    try {
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      await FileSystem.copyAsync({ from: asset.uri, to: pendingPath });
    } catch {
      Alert.alert('Import failed', "Couldn't import file");
      return;
    }

    const pendingBook: Book = {
      id: pendingId,
      filename: asset.name,
      path: pendingPath,
      addedAt: new Date().toISOString(),
      extractionStatus: 'pending',
    };

    await saveBook(pendingBook);
    setBooks((prev) => [...prev, pendingBook]);

    try {
      const extractionResult = await extractPdf(pendingPath);
      const bookId = extractionResult.book_id;
      const finalPath = `${destDir}${bookId}-${asset.name}`;

      await FileSystem.moveAsync({ from: pendingPath, to: finalPath });

      const extractionStatus: ExtractionStatus =
        extractionResult.status === 'failed' ? 'failed' : 'ready';

      const finalBook: Book = {
        ...pendingBook,
        id: bookId,
        path: finalPath,
        extractionStatus,
        extractionResult,
      };

      await replaceBook(pendingId, finalBook);
      setBooks((prev) => prev.map((b) => (b.id === pendingId ? finalBook : b)));
    } catch {
      const failedBook: Book = { ...pendingBook, extractionStatus: 'failed' };
      await replaceBook(pendingId, failedBook);
      setBooks((prev) => prev.map((b) => (b.id === pendingId ? failedBook : b)));
    }
  }

  return (
    <LibraryContext.Provider value={{ books, importBook }}>
      {children}
    </LibraryContext.Provider>
  );
}
