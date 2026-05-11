import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ExtractionResult } from '../../types';
import BlockRenderer from './BlockRenderer';
import ConfidenceBadge from './ConfidenceBadge';
import ReaderSettings, { ReaderConfig } from './ReaderSettings';

type Props = {
  result: ExtractionResult;
};

const DEFAULT_CONFIG: ReaderConfig = {
  fontSize: 16,
  background: { label: 'White', background: '#FFFFFF', text: '#111111' },
};

export default function ExtractedReader({ result }: Props) {
  const [config, setConfig] = useState<ReaderConfig>(DEFAULT_CONFIG);

  return (
    <View style={[styles.container, { backgroundColor: config.background.background }]}>
      <ConfidenceBadge overallConfidence={result.overall_confidence} />
      <ReaderSettings config={config} onChange={setConfig} />
      <ScrollView contentContainerStyle={styles.content}>
        {result.blocks.map((block, index) => (
          <BlockRenderer key={index} block={block} fontSize={config.fontSize} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: 16 },
});
