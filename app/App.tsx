import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { displayThumb, needsReview, type Item } from './src/items';
import { ReviewSheet } from './src/ReviewSheet';
import { SAMPLE_ITEMS } from './src/sampleItems';

export default function App() {
  const [items, setItems] = useState<Item[]>(SAMPLE_ITEMS);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const reviewing = items.find((item) => item.id === reviewingId) ?? null;

  const update = (next: Item) =>
    setItems((current) => current.map((item) => (item.id === next.id ? next : item)));

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>My Wardrobe</Text>
        <View style={styles.grid}>
          {items.map((item) => {
            const flagged = needsReview(item);
            return (
              <Pressable
                key={item.id}
                style={styles.tile}
                onPress={flagged ? () => setReviewingId(item.id) : undefined}
                accessibilityLabel={flagged ? `${item.name}, needs review` : item.name}
              >
                <Image source={displayThumb(item)} style={styles.image} resizeMode="contain" />
                {flagged && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Review</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
        <ReviewSheet item={reviewing} onClose={() => setReviewingId(null)} onChange={update} />
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
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#F2A93B',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#3D2600' },
});
