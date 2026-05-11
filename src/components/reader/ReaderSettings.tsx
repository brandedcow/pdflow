import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type Background = {
  label: string;
  background: string;
  text: string;
};

export type ReaderConfig = {
  fontSize: number;
  background: Background;
};

export const FONT_SIZES: { label: string; size: number }[] = [
  { label: 'S', size: 14 },
  { label: 'M', size: 16 },
  { label: 'L', size: 18 },
  { label: 'XL', size: 22 },
];

export const BACKGROUNDS: Background[] = [
  { label: 'White', background: '#FFFFFF', text: '#111111' },
  { label: 'Sepia', background: '#F5E6C8', text: '#3B2F2F' },
  { label: 'Dark', background: '#1A1A1A', text: '#E5E5E5' },
];

type Props = {
  config: ReaderConfig;
  onChange: (config: ReaderConfig) => void;
};

export default function ReaderSettings({ config, onChange }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {FONT_SIZES.map(({ label, size }) => (
          <TouchableOpacity
            key={label}
            style={[styles.option, config.fontSize === size && styles.selected]}
            onPress={() => onChange({ ...config, fontSize: size })}
          >
            <Text style={styles.optionText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.row}>
        {BACKGROUNDS.map((bg) => (
          <TouchableOpacity
            key={bg.label}
            style={[styles.option, { backgroundColor: bg.background }, config.background.label === bg.label && styles.selected]}
            onPress={() => onChange({ ...config, background: bg })}
          >
            <Text style={[styles.optionText, { color: bg.text }]}>{bg.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  option: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: '#ddd' },
  selected: { borderColor: '#000', borderWidth: 2 },
  optionText: { fontSize: 13 },
});
