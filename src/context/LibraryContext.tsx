import React, { createContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Book } from '../types';
import { loadBooks, saveBook } from '../storage/storage';

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
    const id = Crypto.randomUUID();
    const destDir = `${FileSystem.documentDirectory}pdfs/`;
    const destPath = `${destDir}${id}-${asset.name}`;

    try {
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      await FileSystem.copyAsync({ from: asset.uri, to: destPath });

      const book: Book = {
        id,
        filename: asset.name,
        path: destPath,
        addedAt: new Date().toISOString(),
      };

      await saveBook(book);
      setBooks((prev) => [...prev, book]);
    } catch {
      Alert.alert('Import failed', "Couldn't import file");
    }
  }

  return (
    <LibraryContext.Provider value={{ books, importBook }}>{children}</LibraryContext.Provider>
  );
}
