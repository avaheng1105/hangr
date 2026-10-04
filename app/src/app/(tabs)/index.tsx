import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Chip } from '../../Chip';
import { useCloset } from '../../ClosetContext';
import {
  CATEGORIES,
  categoryLabel,
  displayThumb,
  needsReview,
  type Category,
  type Item,
} from '../../items';
import { colors } from '../../theme';

// The closet: every item as a tile, filterable by kind.
export default function Wardrobe() {
  const { items, message, adding, live, addPhoto } = useCloset();
  const [filter, setFilter] = useState<Category | null>(null);

  // Only the kinds the closet actually has, in the usual order.
  const kinds = [...CATEGORIES, 'auto' as const].filter((c) =>
    items.some((item) => item.category === c),
  );
  // A filter whose last item was deleted or changed shows everything again.
  const active = filter && kinds.includes(filter) ? filter : null;
  const shown = active ? items.filter((item) => item.category === active) : items;

  return (
    <View style={styles.screen}>
      {message && <Text style={styles.message}>{message}</Text>}
      {kinds.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filters}
          contentContainerStyle={styles.filtersContent}
        >
          <Chip label="All" selected={active === null} onPress={() => setFilter(null)} />
          {kinds.map((kind) => (
            <Chip
              key={kind}
              label={categoryLabel(kind)}
              selected={active === kind}
              onPress={() => setFilter(active === kind ? null : kind)}
            />
          ))}
        </ScrollView>
      )}
      <ScrollView contentContainerStyle={styles.grid}>
        {live && (
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
        {shown.map((item) => (
          <Tile key={item.id} item={item} onPress={() => router.push(`/item/${item.id}`)} />
        ))}
      </ScrollView>
    </View>
  );
}

function Tile({ item, onPress }: { item: Item; onPress: () => void }) {
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
    <Pressable style={styles.tile} onPress={onPress} accessibilityLabel={label}>
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
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  message: { fontSize: 14, color: colors.danger, marginBottom: 12, textAlign: 'center' },
  filters: { flexGrow: 0, marginBottom: 12 },
  filtersContent: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 24 },
  tile: {
    width: '48%',
    aspectRatio: 0.8,
    backgroundColor: colors.surface,
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
  addText: { fontSize: 16, fontWeight: '600', color: colors.accent },
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
  overlayDetail: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  overlayText: { fontSize: 13, color: '#4A4E5C', textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.badge,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.badgeText },
});
