import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { closet } from './src/closet';
import { displayThumb, needsReview, type Item, type ReviewResolution } from './src/items';
import { ReviewSheet } from './src/ReviewSheet';

// How often to check on items the pipeline is still working on.
const POLL_MS = 4000;

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const reviewing = items.find((item) => item.id === reviewingId) ?? null;

  const refresh = useCallback(async () => {
    try {
      setItems(await closet.load());
    } catch (e) {
      setMessage(`Couldn't load your closet: ${errorMessage(e)}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const working = items.some((item) => item.status === 'uploading' || item.status === 'processing');
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [working, refresh]);

  const replace = (next: Item) =>
    setItems((current) => current.map((item) => (item.id === next.id ? next : item)));

  const addPhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
      // iPhone photos are HEIC by default; ask for JPEG, which the pipeline reads.
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (picked.canceled) return;
    setAdding(true);
    setMessage(null);
    try {
      await closet.add(picked.assets[0]);
      await refresh();
    } catch (e) {
      setMessage(`Couldn't add that photo: ${errorMessage(e)}`);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (item: Item) => {
    try {
      await closet.remove(item);
      setItems((current) => current.filter((i) => i.id !== item.id));
    } catch (e) {
      setMessage(`Couldn't remove that item: ${errorMessage(e)}`);
    }
  };

  const review = async (item: Item, resolution: ReviewResolution) => {
    replace(await closet.review(item, resolution));
  };

  const regenerate = async (item: Item, note: string) => {
    replace(await closet.regenerate(item, note));
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>My Wardrobe</Text>
        {message && <Text style={styles.message}>{message}</Text>}
        <ScrollView contentContainerStyle={styles.grid}>
          {closet.live && (
            <Pressable
              style={[styles.tile, styles.addTile]}
              onPress={addPhoto}
              disabled={adding}
              accessibilityRole="button"
              accessibilityLabel="Add an item"
            >
              {adding ? <ActivityIndicator /> : <Text style={styles.addText}>+ Add</Text>}
            </Pressable>
          )}
          {items.map((item) => (
            <Tile
              key={item.id}
              item={item}
              onReview={() => setReviewingId(item.id)}
              onRemove={() => void remove(item)}
            />
          ))}
        </ScrollView>
        <ReviewSheet
          item={reviewing}
          onClose={() => setReviewingId(null)}
          onReview={review}
          onRegenerate={regenerate}
        />
        <StatusBar style="dark" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Tile({
  item,
  onReview,
  onRemove,
}: {
  item: Item;
  onReview: () => void;
  onRemove: () => void;
}) {
  const flagged = needsReview(item);
  const working = item.status === 'uploading' || item.status === 'processing';
  // A new item has no image until its first run finishes.
  const hasImage = item.status === 'ready' || item.assets.cutout !== undefined;
  const label = flagged
    ? `${item.name}, needs review`
    : working
      ? `${item.name}, processing`
      : item.status === 'failed'
        ? `${item.name}, couldn't be processed`
        : item.name;

  return (
    <Pressable
      style={styles.tile}
      onPress={flagged ? onReview : item.status === 'failed' ? onRemove : undefined}
      accessibilityLabel={label}
    >
      {hasImage && <Image source={displayThumb(item)} style={styles.image} resizeMode="contain" />}
      {working && (
        <View style={styles.overlay}>
          <ActivityIndicator />
          <Text style={styles.overlayText}>Processing</Text>
        </View>
      )}
      {item.status === 'failed' && (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>Couldn&apos;t process this photo</Text>
          {item.error && <Text style={styles.overlayDetail}>{item.error}</Text>}
          <Text style={styles.overlayDetail}>Tap to remove</Text>
        </View>
      )}
      {flagged && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Review</Text>
        </View>
      )}
    </Pressable>
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
  message: { fontSize: 14, color: '#B3261E', marginBottom: 12, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '48%',
    aspectRatio: 0.8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#B9B8C6',
    backgroundColor: 'transparent',
  },
  addText: { fontSize: 16, fontWeight: '600', color: '#5B5FC7' },
  image: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 8,
  },
  overlayDetail: { fontSize: 12, color: '#6B6F7E', textAlign: 'center' },
  overlayText: { fontSize: 13, color: '#4A4E5C', textAlign: 'center' },
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
