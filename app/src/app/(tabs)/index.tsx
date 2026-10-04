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
  SECTIONS,
  displayThumb,
  needsReview,
  sectionOf,
  subcategoryOf,
  type Item,
} from '../../items';
import { colors } from '../../theme';

// Sidebar entries besides the sections: everything, and items whose kind
// isn't known yet.
const ALL = 'all';
const NOT_SET = 'auto';

// The closet: sections down the side, subcategories along the top, and the
// items as tiles.
export default function Wardrobe() {
  const { items, message, adding, live, addPhoto } = useCloset();
  const [sectionKey, setSectionKey] = useState(ALL);
  const [subKey, setSubKey] = useState<string | null>(null);

  const hasUnset = items.some((item) => item.category === 'auto');
  // "Not set" goes away once its last item gets a kind.
  const current = sectionKey === NOT_SET && !hasUnset ? ALL : sectionKey;
  const section = SECTIONS.find((s) => s.key === current);

  const inSection = items.filter((item) =>
    current === ALL
      ? true
      : current === NOT_SET
        ? item.category === 'auto'
        : sectionOf(item.category)?.key === current,
  );
  const shown = subKey ? inSection.filter((item) => subcategoryOf(item) === subKey) : inSection;

  const choose = (key: string) => {
    setSectionKey(key);
    setSubKey(null);
  };

  const sidebar = [
    { key: ALL, label: 'All' },
    ...SECTIONS,
    ...(hasUnset ? [{ key: NOT_SET, label: 'Not set' }] : []),
  ];
  const emptyLabel = subKey
    ? section?.subcategories.find((s) => s.key === subKey)?.label.toLowerCase()
    : section?.label.toLowerCase();

  return (
    <View style={styles.screen}>
      {message && <Text style={styles.message}>{message}</Text>}
      <View style={styles.columns}>
        <ScrollView style={styles.sidebar} showsVerticalScrollIndicator={false}>
          {sidebar.map((entry) => {
            const selected = entry.key === current;
            return (
              <Pressable
                key={entry.key}
                style={[styles.sideItem, selected && styles.sideItemSelected]}
                onPress={() => choose(entry.key)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                {selected && <View style={styles.sideMarker} />}
                <Text style={[styles.sideText, selected && styles.sideTextSelected]}>
                  {entry.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.main}>
          {section && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filters}
              contentContainerStyle={styles.filtersContent}
            >
              <Chip label="All" selected={subKey === null} onPress={() => setSubKey(null)} />
              {section.subcategories.map((s) => (
                <Chip
                  key={s.key}
                  label={s.label}
                  selected={subKey === s.key}
                  onPress={() => setSubKey(subKey === s.key ? null : s.key)}
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
            {shown.length === 0 && (
              <Text style={styles.empty}>
                {current === ALL ? 'Your wardrobe is empty.' : `No ${emptyLabel} yet.`}
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
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
  screen: { flex: 1, backgroundColor: colors.background },
  message: {
    fontSize: 14,
    color: colors.danger,
    marginBottom: 12,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  columns: { flex: 1, flexDirection: 'row' },
  sidebar: { flexGrow: 0, width: 100 },
  sideItem: { paddingVertical: 14, paddingLeft: 12, paddingRight: 4, justifyContent: 'center' },
  sideItemSelected: { backgroundColor: colors.surface },
  sideMarker: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  sideText: { fontSize: 13, color: colors.muted },
  sideTextSelected: { color: colors.text, fontWeight: '700' },
  main: { flex: 1, paddingHorizontal: 12 },
  filters: { flexGrow: 0, marginBottom: 12 },
  filtersContent: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 24 },
  empty: { fontSize: 14, color: colors.muted, marginTop: 24, width: '100%', textAlign: 'center' },
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
