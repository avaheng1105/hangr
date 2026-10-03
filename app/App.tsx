import { StatusBar } from 'expo-status-bar';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// Pipeline output for pipeline/samples/tshirt.jpg
// (`python -m hangr_pipeline samples/tshirt.jpg --cutout colorkey`).
// Placeholder until the wardrobe screen loads real items.
const SAMPLE_CUTOUT = require('./assets/sample/cutout.png');

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>My Wardrobe</Text>
        <View style={styles.grid}>
          <View style={styles.tile}>
            <Image source={SAMPLE_CUTOUT} style={styles.image} resizeMode="contain" />
          </View>
        </View>
        <StatusBar style="dark" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F4F8', padding: 16 },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2433',
    textAlign: 'center',
    marginBottom: 16,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '48%',
    aspectRatio: 0.8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
  },
  image: { width: '100%', height: '100%' },
});
