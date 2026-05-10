import AsyncStorage from '@react-native-async-storage/async-storage';
import { Book } from '../types';

const STORAGE_KEY = 'pdflow_books';

export async function loadBooks(): Promise<Book[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Book[];
}

export async function saveBook(book: Book): Promise<void> {
  const existing = await loadBooks();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, book]));
}
