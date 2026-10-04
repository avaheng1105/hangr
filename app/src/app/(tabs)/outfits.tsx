import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCloset } from '../../ClosetContext';
import { OutfitCollage } from '../../OutfitCollage';
import { colors } from '../../theme';

// The user's saved outfits.
export default function OutfitsScreen() {
  const { outfits, items } = useCloset();
  const byId = new Map(items.map((item) => [item.id, item]));

  return (
    <ScrollView contentContainerStyle={styles.grid}>
      <Pressable
        style={[styles.card, styles.newCard]}
        onPress={() => router.push('/outfit/new')}
        accessibilityRole="button"
        accessibilityLabel="New outfit"
      >
        <Text style={styles.newText}>+ New outfit</Text>
      </Pressable>
      {outfits.map((outfit) => {
        const outfitItems = outfit.itemIds.flatMap((id) => byId.get(id) ?? []);
        const name = outfit.name || 'Outfit';
        return (
          <Pressable
            key={outfit.id}
            style={styles.card}
            onPress={() => router.push(`/outfit/${outfit.id}`)}
            accessibilityLabel={`${name}, ${outfitItems.length} items`}
          >
            <OutfitCollage items={outfitItems} />
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.count}>
              {outfitItems.length} {outfitItems.length === 1 ? 'item' : 'items'}
            </Text>
          </Pressable>
        );
      })}
      {outfits.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.count}>
            Put together items from your wardrobe and save them as an outfit.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16, paddingTop: 0 },
  card: { width: '48%', gap: 4 },
  newCard: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#B9B8C6',
    borderRadius: 8,
  },
  newText: { fontSize: 16, fontWeight: '600', color: colors.accent },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  count: { fontSize: 13, color: colors.muted },
  empty: { width: '48%', justifyContent: 'center', padding: 8 },
});
