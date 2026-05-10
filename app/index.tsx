import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useLibrary } from '../src/hooks/useLibrary';
import { Book } from '../src/types';

export default function LibraryScreen() {
  const { books, importBook } = useLibrary();

  function handleBookPress(book: Book) {
    router.push({ pathname: '/reader', params: { uri: book.path } });
  }

  return (
    <View style={styles.container}>
      {books.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No PDFs yet. Tap + to import one.</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 80 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.bookItem} onPress={() => handleBookPress(item)}>
              <Text style={styles.bookTitle}>{item.filename}</Text>
              <Text style={styles.bookDate}>{new Date(item.addedAt).toLocaleDateString()}</Text>
            </TouchableOpacity>
          )}
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={importBook} accessibilityLabel="Import PDF">
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  bookItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  bookTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  bookDate: { fontSize: 12, color: '#888', marginTop: 2 },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32 },
});
