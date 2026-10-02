import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { TiltViewer } from './src/viewer/TiltViewer';

// Output of the pipeline for pipeline/samples/tshirt.jpg
// (`python -m hangr_pipeline samples/tshirt.jpg --cutout colorkey --depth inflate`).
const SAMPLE = {
  cutout: require('./assets/sample/cutout.png'),
  depth: require('./assets/sample/depth.png'),
};

const DEPTHS = [
  { label: 'Flat', value: 0.06 },
  { label: 'Soft', value: 0.14 },
  { label: 'Puffy', value: 0.24 },
];

export default function App() {
  const [depthScale, setDepthScale] = useState(0.14);
  const [showDepth, setShowDepth] = useState(false);
  const [useSensor, setUseSensor] = useState(true);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Hangr</Text>
          <Text style={styles.subtitle}>
            Tilt viewer prototype — tilt your phone or drag the item
          </Text>

          <TiltViewer
            cutout={SAMPLE.cutout}
            depth={SAMPLE.depth}
            depthScale={depthScale}
            showDepth={showDepth}
            useSensor={useSensor}
            style={styles.viewer}
          />

          <Text style={styles.label}>Depth</Text>
          <View style={styles.row}>
            {DEPTHS.map((d) => (
              <Chip
                key={d.label}
                label={d.label}
                active={depthScale === d.value}
                onPress={() => setDepthScale(d.value)}
              />
            ))}
          </View>

          <Text style={styles.label}>Debug</Text>
          <View style={styles.row}>
            <Chip
              label="Show depth map"
              active={showDepth}
              onPress={() => setShowDepth(!showDepth)}
            />
            <Chip
              label="Motion sensor"
              active={useSensor}
              onPress={() => setUseSensor(!useSensor)}
            />
          </View>
        </ScrollView>
        <StatusBar style="dark" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F1EA' },
  content: { padding: 16, paddingTop: 32, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#1F2433' },
  subtitle: { fontSize: 15, color: '#5B6070', marginTop: 4, marginBottom: 16 },
  viewer: { width: '100%', aspectRatio: 1, borderRadius: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#5B6070', marginTop: 20, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#E7E2D8',
  },
  chipActive: { backgroundColor: '#1F2433' },
  chipText: { fontSize: 14, color: '#1F2433' },
  chipTextActive: { color: '#FFFFFF' },
});
