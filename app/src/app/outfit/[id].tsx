import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Chip } from '../../Chip';
import { useCloset } from '../../ClosetContext';
import {
  byKind,
  CATEGORIES,
  categoryLabel,
  displayThumb,
  type Category,
  type Item,
} from '../../items';
import { OUTFIT_NAME_MAX_CHARS, type Outfit } from '../../outfits';
import { colors } from '../../theme';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

const ORDER: Category[] = [...CATEGORIES, 'auto'];

// Create an outfit (/outfit/new) or edit one.
export default function OutfitEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { outfits } = useCloset();
  const outfit = outfits.find((o) => o.id === id);

  if (id !== 'new' && !outfit) {
    return (
      <View style={styles.centred}>
        <Text style={styles.muted}>This outfit was deleted.</Text>
      </View>
    );
  }
  return <Editor key={id} outfit={outfit} />;
}

function Editor({ outfit }: { outfit?: Outfit }) {
  const { items, saveOutfit, removeOutfit } = useCloset();
  const [name, setName] = useState(outfit?.name ?? '');
  const [selected, setSelected] = useState<string[]>(outfit?.itemIds ?? []);
  const [filter, setFilter] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only finished items can go in an outfit.
  const ready = items.filter((item) => item.status === 'ready');
  const kinds = ORDER.filter((c) => ready.some((item) => item.category === c));
  const active = filter && kinds.includes(filter) ? filter : null;
  const choices = active ? ready.filter((item) => item.category === active) : ready;
  const chosen = selected.flatMap((id) => ready.find((item) => item.id === id) ?? []);

  const toggle = (item: Item) =>
    setSelected((current) =>
      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
    );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveOutfit({
        id: outfit?.id,
        name,
        itemIds: [...chosen].sort(byKind).map((item) => item.id),
      });
      router.back();
    } catch (e) {
      setError(`Couldn't save: ${errorMessage(e)}`);
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!outfit) return;
    const doDelete = async () => {
      try {
        await removeOutfit(outfit.id);
        router.back();
      } catch (e) {
        setError(`Couldn't delete: ${errorMessage(e)}`);
      }
    };
    const question = "Delete this outfit? Its items stay in your wardrobe.";
    if (Platform.OS === 'web') {
      if (window.confirm(question)) void doDelete();
      return;
    }
    Alert.alert('Delete outfit', question, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: outfit ? outfit.name || 'Outfit' : 'New outfit' }} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Weekend brunch"
          placeholderTextColor="#9A9DAA"
          maxLength={OUTFIT_NAME_MAX_CHARS}
        />

        <Text style={styles.label}>In this outfit</Text>
        {chosen.length === 0 ? (
          <Text style={styles.muted}>Tap items below to add them.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.row}>
              {[...chosen].sort(byKind).map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.chosen}
                  onPress={() => toggle(item)}
                  accessibilityLabel={`Remove ${item.name}`}
                >
                  <Image source={displayThumb(item)} style={styles.image} resizeMode="contain" />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}

        <Text style={styles.label}>Your wardrobe</Text>
        {kinds.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.row}>
              <Chip label="All" selected={active === null} onPress={() => setFilter(null)} />
              {kinds.map((kind) => (
                <Chip
                  key={kind}
                  label={categoryLabel(kind)}
                  selected={active === kind}
                  onPress={() => setFilter(active === kind ? null : kind)}
                />
              ))}
            </View>
          </ScrollView>
        )}
        <View style={styles.grid}>
          {choices.map((item) => {
            const isIn = selected.includes(item.id);
            return (
              <Pressable
                key={item.id}
                style={[styles.tile, isIn && styles.tileSelected]}
                onPress={() => toggle(item)}
                accessibilityLabel={item.name}
                accessibilityState={{ selected: isIn }}
              >
                <Image source={displayThumb(item)} style={styles.image} resizeMode="contain" />
              </Pressable>
            );
          })}
          {ready.length === 0 && (
            <Text style={styles.muted}>Add some items to your wardrobe first.</Text>
          )}
        </View>

        <Pressable
          style={[styles.button, styles.primary, (saving || chosen.length === 0) && styles.dim]}
          onPress={() => void save()}
          disabled={saving || chosen.length === 0}
          accessibilityRole="button"
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Save outfit</Text>}
        </Pressable>
        {error && <Text style={styles.error}>{error}</Text>}
        {outfit && (
          <Pressable style={styles.button} onPress={confirmDelete} accessibilityRole="button">
            <Text style={styles.deleteText}>Delete outfit</Text>
          </Pressable>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 8, paddingBottom: 40 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 12 },
  muted: { fontSize: 14, color: colors.muted },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  row: { flexDirection: 'row', gap: 8 },
  chosen: { width: 88, height: 88, backgroundColor: colors.surface, borderRadius: 8, padding: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '31%',
    aspectRatio: 0.8,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tileSelected: { borderColor: colors.accent },
  image: { width: '100%', height: '100%' },
  button: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  dim: { opacity: 0.5 },
  primaryText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  deleteText: { fontSize: 15, fontWeight: '600', color: colors.danger },
  error: { fontSize: 14, color: colors.danger },
});
