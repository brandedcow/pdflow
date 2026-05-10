import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Pdf from 'react-native-pdf';

export default function ReaderScreen() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!uri) setHasError(true);
  }, [uri]);

  if (hasError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Could not open this PDF.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
      </View>
      <Pdf
        trustAllCerts={false}
        source={{ uri, cache: false }}
        onError={() => setHasError(true)}
        style={styles.pdf}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  backButton: { fontSize: 16, color: '#111' },
  pdf: { flex: 1 },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 16, color: '#333', marginBottom: 16, textAlign: 'center' },
  backLink: { fontSize: 16, color: '#007AFF' },
});
