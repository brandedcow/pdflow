import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ExtractionResult } from '../../types';
import BlockRenderer from './BlockRenderer';
import ConfidenceBadge from './ConfidenceBadge';
import ReaderSettings, { BACKGROUNDS, FONT_SIZES, ReaderConfig } from './ReaderSettings';

type Props = {
  result: ExtractionResult;
};

const DEFAULT_BACKGROUND = { label: 'White', background: '#FFFFFF', text: '#111111' };
const DEFAULT_FONT_SIZE = 16; // M

function getDefaultConfig(): ReaderConfig {
  return {
    fontSize: FONT_SIZES?.[1]?.size ?? DEFAULT_FONT_SIZE,
    background: BACKGROUNDS?.[0] ?? DEFAULT_BACKGROUND,
  };
}

export default function ExtractedReader({ result }: Props) {
  const [config, setConfig] = useState<ReaderConfig>(getDefaultConfig);

  return (
    <View style={[styles.container, { backgroundColor: config.background.background }]}>
      <ConfidenceBadge overallConfidence={result.overall_confidence} />
      <ReaderSettings config={config} onChange={setConfig} />
      <ScrollView contentContainerStyle={styles.content}>
        {result.blocks.map((block, index) => (
          <BlockRenderer key={`${block.type}-${index}`} block={block} fontSize={config.fontSize} textColor={config.background.text} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: 16 },
});
