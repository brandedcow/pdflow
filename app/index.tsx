import React, { useRef } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useLibrary } from '../src/hooks/useLibrary';
import { Book } from '../src/types';

function BookStatusIcon({ book, onRetry }: { book: Book; onRetry?: () => void }) {
  if (book.extractionStatus === 'pending') {
    return <ActivityIndicator testID="extraction-pending" size="small" color="#9CA3AF" style={styles.statusIcon} />;
  }
  if (book.extractionStatus === 'failed') {
    return (
      <TouchableOpacity onPress={() => onRetry?.()} accessibilityLabel="Retry extraction" style={styles.statusIcon}>
        <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
      </TouchableOpacity>
    );
  }
  return null;
}

function BookRow({ book, onPress, onDelete, onRetry }: { book: Book; onPress: () => void; onDelete: () => void; onRetry?: () => void }) {
  const swipeableRef = useRef<Swipeable>(null);

  function handleDelete() {
    Alert.alert(
      `Delete "${book.filename}"?`,
      'This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => swipeableRef.current?.close(),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            swipeableRef.current?.close();
            void onDelete();
          },
        },
      ]
    );
  }

  function renderRightActions() {
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={handleDelete}>
        <Text style={styles.deleteActionText}>Delete</Text>
      </TouchableOpacity>
    );
  }

  return (
    <Swipeable ref={swipeableRef} renderRightActions={renderRightActions}>
      <TouchableOpacity style={styles.bookItem} onPress={onPress}>
        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle}>{book.filename}</Text>
          <Text style={styles.bookDate}>{new Date(book.addedAt).toLocaleDateString()}</Text>
        </View>
        <BookStatusIcon book={book} onRetry={onRetry} />
      </TouchableOpacity>
    </Swipeable>
  );
}

export default function LibraryScreen() {
  const { books, importBook, deleteBook, retryExtraction } = useLibrary();

  function handleBookPress(book: Book) {
    router.push({ pathname: '/reader', params: { bookId: book.id, uri: book.path } });
  }

  return (
    <SafeAreaView style={styles.container}>
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
            <BookRow
              book={item}
              onPress={() => handleBookPress(item)}
              onDelete={() => deleteBook(item.id)}
              onRetry={() => retryExtraction(item.id)}
            />
          )}
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={importBook} accessibilityLabel="Import PDF">
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  bookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  bookDate: { fontSize: 12, color: '#888', marginTop: 2 },
  statusIcon: { marginLeft: 12 },
  deleteAction: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  deleteActionText: { color: '#fff', fontSize: 14, fontWeight: '600' },
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
