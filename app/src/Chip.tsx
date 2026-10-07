import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from './theme';

// A small pill-shaped toggle, for filters and pickers.
export function Chip(props: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      style={[styles.chip, props.selected && styles.selected]}
    >
      <Text style={[styles.text, props.selected && styles.selectedText]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  text: { fontSize: 14, color: colors.text },
  selectedText: { color: '#FFFFFF', fontWeight: '600' },
});
