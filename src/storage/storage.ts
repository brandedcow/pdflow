import AsyncStorage from '@react-native-async-storage/async-storage';
import { Book } from '../types';

const STORAGE_KEY = 'pdflow_books';

export async function loadBooks(): Promise<Book[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Book[];
  } catch {
    return [];
  }
}

export async function saveBook(book: Book): Promise<void> {
  const existing = await loadBooks();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, book]));
}

export async function replaceBook(oldId: string, newBook: Book): Promise<void> {
  const existing = await loadBooks();
  const updated = existing.map((b) => (b.id === oldId ? newBook : b));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
