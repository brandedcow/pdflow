import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { ExtractionBlock } from '../../types';

type Props = {
  block: ExtractionBlock;
  fontSize: number;
  textColor?: string;
  testID?: string;
};

export default function BlockRenderer({ block, fontSize, textColor, testID }: Props) {
  const lowConfidence = block.confidence < 0.6;
  const containerStyle = [
    styles.container,
    lowConfidence && styles.lowConfidence,
  ];

  if (block.type === 'heading') {
    return (
      <View style={containerStyle} testID={testID}>
        <Text style={[styles.heading, { fontSize: fontSize + 4, color: textColor ?? '#111' }]}>{block.content}</Text>
      </View>
    );
  }

  if (block.type === 'table') {
    return (
      <View style={containerStyle} testID={testID}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Markdown>{block.content}</Markdown>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={containerStyle} testID={testID}>
      <Text style={[styles.text, { fontSize, color: textColor ?? '#111' }]}>{block.content}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12, paddingHorizontal: 16 },
  lowConfidence: {
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    paddingLeft: 12,
  },
  heading: { fontWeight: '700', color: '#111', marginBottom: 4 },
  text: { color: '#111', lineHeight: 24 },
});
