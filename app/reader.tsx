import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLibrary } from '../src/hooks/useLibrary';
import ReaderContainer from '../src/components/reader/ReaderContainer';

type ActiveView = 'pdf' | 'reader';

export default function ReaderScreen() {
  const { bookId, uri } = useLocalSearchParams<{ bookId: string; uri: string }>();
  const { books, retryExtraction } = useLibrary();
  const insets = useSafeAreaInsets();
  const book = books.find((b) => b.id === bookId);

  const [activeView, setActiveView] = useState<ActiveView>(
    book?.extractionStatus === 'ready' ? 'reader' : 'pdf'
  );

  const canToggle = book?.extractionStatus === 'ready';
  const canRetry = book?.extractionStatus === 'failed';
  const isPending = book?.extractionStatus === 'pending';

  function handleToggle() {
    setActiveView((v) => (v === 'reader' ? 'pdf' : 'reader'));
  }

  async function handleRetry() {
    if (bookId) await retryExtraction(bookId);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {canRetry && (
            <TouchableOpacity
              onPress={handleRetry}
              style={styles.headerIcon}
              accessibilityLabel="Retry extraction"
            >
              <Ionicons name="refresh-outline" size={22} color="#111" />
            </TouchableOpacity>
          )}
          {(canToggle || isPending) && (
            <TouchableOpacity
              onPress={canToggle ? handleToggle : undefined}
              style={[styles.headerIcon, !canToggle && styles.headerIconDisabled]}
              accessibilityLabel="Toggle view"
            >
              <Ionicons
                name={activeView === 'reader' ? 'document-outline' : 'document-text-outline'}
                size={22}
                color={canToggle ? '#111' : '#ccc'}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <ReaderContainer book={book} uri={uri} activeView={activeView} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  backButton: { fontSize: 16, color: '#111' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { padding: 4 },
  headerIconDisabled: { opacity: 0.4 },
});
