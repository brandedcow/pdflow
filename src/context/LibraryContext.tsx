import React, { createContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { File as FSFile } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { Book, ExtractionStatus } from '../types';
import { loadBooks, saveBook, replaceBook, deleteBook as storageDeleteBook } from '../storage/storage';
import { extractPdf } from '../api/extractionApi';

type LibraryContextType = {
  books: Book[];
  importBook: () => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  retryExtraction: (bookId: string) => Promise<void>;
};

export const LibraryContext = createContext<LibraryContextType | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    loadBooks().then(setBooks);
  }, []);

  async function runExtraction(currentId: string, book: Book): Promise<void> {
    const destDir = `${FileSystem.documentDirectory}pdfs/`;
    try {
      const extractionResult = await extractPdf(book.path);
      const bookId = extractionResult.book_id;
      const finalPath = `${destDir}${bookId}-${book.filename}`;
      await new FSFile(book.path).move(new FSFile(finalPath));
      const extractionStatus: ExtractionStatus =
        extractionResult.status === 'failed' ? 'failed' : 'ready';
      const finalBook: Book = {
        ...book,
        id: bookId,
        path: finalPath,
        extractionStatus,
        extractionResult,
      };
      await replaceBook(currentId, finalBook);
      setBooks((prev) => prev.map((b) => (b.id === currentId ? finalBook : b)));
    } catch {
      const failedBook: Book = { ...book, extractionStatus: 'failed' };
      await replaceBook(currentId, failedBook);
      setBooks((prev) => prev.map((b) => (b.id === currentId ? failedBook : b)));
    }
  }

  async function importBook(): Promise<void> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: false,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    const isDuplicate = books.some((b) => b.filename === asset.name);
    if (isDuplicate) {
      Alert.alert('Already in library', `"${asset.name}" is already in your library.`);
      return;
    }

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
    await runExtraction(pendingId, pendingBook);
  }

  async function retryExtraction(bookId: string): Promise<void> {
    const book = books.find((b) => b.id === bookId);
    if (!book || book.extractionStatus !== 'failed') return;

    const pendingBook: Book = { ...book, extractionStatus: 'pending' };
    await replaceBook(bookId, pendingBook);
    setBooks((prev) => prev.map((b) => (b.id === bookId ? pendingBook : b)));
    await runExtraction(bookId, pendingBook);
  }

  async function deleteBook(id: string): Promise<void> {
    const book = books.find((b) => b.id === id);
    if (!book) return;
    try {
      const file = new FSFile(book.path);
      if (file.exists) {
        file.delete();
      }
    } catch (e) {
      console.error('[deleteBook] file delete failed for path:', book.path, e);
      Alert.alert('Delete failed', "Couldn't delete the book");
      return;
    }
    await storageDeleteBook(id);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <LibraryContext.Provider value={{ books, importBook, deleteBook, retryExtraction }}>
      {children}
    </LibraryContext.Provider>
  );
}
