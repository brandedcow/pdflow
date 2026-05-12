import React, { createContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { File as FSFile } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { Book, ExtractionBlock, ExtractionResult, ExtractionStatus } from '../types';
import { loadBooks, saveBook, replaceBook, deleteBook as storageDeleteBook } from '../storage/storage';
import { JobStatusResponse, pollJobStatus, submitExtraction } from '../api/extractionApi';

type LibraryContextType = {
  books: Book[];
  importBook: () => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  retryExtraction: (bookId: string) => Promise<void>;
  checkExtraction: (bookId: string) => Promise<void>;
};

export const LibraryContext = createContext<LibraryContextType | null>(null);

const POLL_INTERVAL_MS = 60_000;
const MAX_CONSECUTIVE_ERRORS = 5;

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);
  const booksRef = useRef<Book[]>([]);
  const pollTimersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const consecutiveErrorsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  useEffect(() => {
    loadBooks().then((loaded) => {
      setBooks(loaded);
      loaded
        .filter((b) => b.extractionStatus === 'pending')
        .forEach((b) => startPolling(b.id));
    });
    return () => {
      Object.values(pollTimersRef.current).forEach(clearInterval);
    };
  }, []);

  function clearPollTimer(bookId: string): void {
    const timer = pollTimersRef.current[bookId];
    if (timer !== undefined) {
      clearInterval(timer);
      delete pollTimersRef.current[bookId];
    }
    delete consecutiveErrorsRef.current[bookId];
  }

  function startPolling(jobId: string): void {
    clearPollTimer(jobId);
    pollTimersRef.current[jobId] = setInterval(
      () => void pollOnce(jobId),
      POLL_INTERVAL_MS
    );
  }

  async function markFailed(bookId: string): Promise<void> {
    const book = booksRef.current.find((b) => b.id === bookId);
    if (!book) return;
    const failedBook: Book = { ...book, extractionStatus: 'failed' };
    await replaceBook(bookId, failedBook);
    setBooks((prev) => prev.map((b) => (b.id === bookId ? failedBook : b)));
  }

  async function pollOnce(jobId: string): Promise<void> {
    try {
      const response = await pollJobStatus(jobId);
      consecutiveErrorsRef.current[jobId] = 0;

      if (response.status === 'success' || response.status === 'partial') {
        clearPollTimer(jobId);
        const result: ExtractionResult = {
          overall_confidence: response.overall_confidence!,
          page_count: response.page_count!,
          blocks: response.blocks as ExtractionBlock[],
        };
        const book = booksRef.current.find((b) => b.id === jobId);
        if (!book) return;
        const updatedBook: Book = { ...book, extractionStatus: 'ready', extractionResult: result };
        await replaceBook(jobId, updatedBook);
        setBooks((prev) => prev.map((b) => (b.id === jobId ? updatedBook : b)));
      } else if (response.status === 'failed') {
        clearPollTimer(jobId);
        await markFailed(jobId);
      }
      // queued/processing: keep polling
    } catch (e: any) {
      if (String(e?.message).includes('404')) {
        clearPollTimer(jobId);
        await markFailed(jobId);
        return;
      }
      consecutiveErrorsRef.current[jobId] =
        (consecutiveErrorsRef.current[jobId] ?? 0) + 1;
      if (consecutiveErrorsRef.current[jobId] >= MAX_CONSECUTIVE_ERRORS) {
        clearPollTimer(jobId);
        await markFailed(jobId);
      }
    }
  }

  async function runExtraction(currentId: string, book: Book): Promise<void> {
    const destDir = `${FileSystem.documentDirectory}pdfs/`;
    try {
      const { job_id } = await submitExtraction(book.path);
      const finalPath = `${destDir}${job_id}-${book.filename}`;
      if (finalPath !== book.path) {
        await new FSFile(book.path).move(new FSFile(finalPath));
      }
      const updatedBook: Book = { ...book, id: job_id, path: finalPath };
      await replaceBook(currentId, updatedBook);
      setBooks((prev) => prev.map((b) => (b.id === currentId ? updatedBook : b)));
      startPolling(job_id);
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

  async function checkExtraction(bookId: string): Promise<void> {
    const book = booksRef.current.find((b) => b.id === bookId);
    if (!book || book.extractionStatus !== 'pending') return;
    clearPollTimer(bookId);
    await pollOnce(bookId);
    if (booksRef.current.find((b) => b.id === bookId)?.extractionStatus === 'pending') {
      startPolling(bookId);
    }
  }

  async function deleteBook(id: string): Promise<void> {
    clearPollTimer(id);
    const book = books.find((b) => b.id === id);
    if (!book) return;
    try {
      const file = new FSFile(book.path);
      if (file.exists) file.delete();
    } catch (e) {
      console.error('[deleteBook] file delete failed:', book.path, e);
      Alert.alert('Delete failed', "Couldn't delete the book");
      return;
    }
    await storageDeleteBook(id);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <LibraryContext.Provider
      value={{ books, importBook, deleteBook, retryExtraction, checkExtraction }}
    >
      {children}
    </LibraryContext.Provider>
  );
}
