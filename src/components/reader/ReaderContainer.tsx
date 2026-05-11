import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Book } from '../../types';
import NativePdfViewer from './NativePdfViewer';
import ExtractedReader from './ExtractedReader';

type Props = {
  book: Book | undefined;
  uri: string | undefined;
};

export default function ReaderContainer({ book, uri }: Props) {
  if (!book || book.extractionStatus === 'failed') {
    return (
      <View style={styles.container}>
        {book?.extractionStatus === 'failed' && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Reader mode unavailable</Text>
          </View>
        )}
        <NativePdfViewer uri={uri} />
      </View>
    );
  }

  if (book.extractionStatus === 'pending') {
    return (
      <View style={styles.container}>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Reader mode processing…</Text>
        </View>
        <NativePdfViewer uri={uri} />
      </View>
    );
  }

  if (book.extractionStatus === 'ready' && book.extractionResult) {
    return <ExtractedReader result={book.extractionResult} />;
  }

  return <NativePdfViewer uri={uri} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  bannerText: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
});
