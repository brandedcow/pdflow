import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  overallConfidence: number;
};

export default function ConfidenceBadge({ overallConfidence }: Props) {
  const isHigh = overallConfidence >= 0.8;
  const label = isHigh ? 'High confidence' : 'Partial confidence';
  const colour = isHigh ? '#10B981' : '#F59E0B';

  return (
    <View
      testID="confidence-badge"
      style={[styles.badge, { backgroundColor: colour }]}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.score}>{Math.round(overallConfidence * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  label: { color: '#fff', fontWeight: '600', fontSize: 13 },
  score: { color: '#fff', fontSize: 13 },
});
