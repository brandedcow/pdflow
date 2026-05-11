import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibrary } from '../src/hooks/useLibrary';
import ReaderContainer from '../src/components/reader/ReaderContainer';

export default function ReaderScreen() {
  const { bookId, uri } = useLocalSearchParams<{ bookId: string; uri: string }>();
  const { books } = useLibrary();
  const insets = useSafeAreaInsets();
  const book = books.find((b) => b.id === bookId);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
      </View>
      <ReaderContainer book={book} uri={uri} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  backButton: { fontSize: 16, color: '#111' },
});
