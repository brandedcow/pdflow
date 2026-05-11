import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import Pdf from 'react-native-pdf';

type Props = {
  uri: string | undefined;
};

export default function NativePdfViewer({ uri }: Props) {
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
    <Pdf
      trustAllCerts={false}
      source={{ uri: uri!, cache: false }}
      onError={() => setHasError(true)}
      style={styles.pdf}
    />
  );
}

const styles = StyleSheet.create({
  pdf: { flex: 1 },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 16, color: '#333', marginBottom: 16, textAlign: 'center' },
  backLink: { fontSize: 16, color: '#007AFF' },
});
