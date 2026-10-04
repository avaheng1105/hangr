import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCloset } from '../ClosetContext';
import { byKind, displayThumb, type Item } from '../items';
import { shuffleOutfit } from '../shuffle';
import { colors } from '../theme';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Random outfits from the wardrobe. Tap an item to lock it in place while
// shuffling the rest; save the ones you like.
export default function Shuffle() {
  const { items, saveOutfit } = useCloset();
  const [outfit, setOutfit] = useState<Item[]>(() => shuffleOutfit(items));
  const [locked, setLocked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shuffle = () => {
    setError(null);
    setOutfit(shuffleOutfit(items, outfit.filter((item) => locked.includes(item.id))));
  };

  const toggleLock = (item: Item) =>
    setLocked((current) =>
      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
    );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveOutfit({ name: '', itemIds: shown.map((item) => item.id) });
      // Open it so it can be named.
      router.replace(`/outfit/${saved.id}`);
    } catch (e) {
      setError(`Couldn't save: ${errorMessage(e)}`);
      setSaving(false);
    }
  };

  const shown = [...outfit].sort(byKind);

  if (shown.length === 0) {
    return (
      <View style={styles.centred}>
        <Text style={styles.muted}>
          Add a top and a bottom, or a dress, to your wardrobe to shuffle outfits. Items need
          their type set.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body}>
        {shown.map((item) => {
          const isLocked = locked.includes(item.id);
          return (
            <Pressable
              key={item.id}
              style={styles.piece}
              onPress={() => toggleLock(item)}
              accessibilityLabel={`${item.name}, ${isLocked ? 'locked' : 'tap to lock'}`}
            >
              <Image source={displayThumb(item)} style={styles.image} resizeMode="contain" />
              <View style={[styles.lock, isLocked && styles.lockOn]}>
                <Ionicons
                  name={isLocked ? 'lock-closed' : 'lock-open-outline'}
                  size={16}
                  color={isLocked ? '#FFFFFF' : colors.muted}
                />
              </View>
            </Pressable>
          );
        })}
        <Text style={styles.hint}>Tap an item to keep it when you shuffle.</Text>
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.primary]} onPress={shuffle} accessibilityRole="button">
          <Ionicons name="shuffle" size={18} color="#FFFFFF" />
          <Text style={styles.primaryText}>Shuffle</Text>
        </Pressable>
        <Pressable
          style={[styles.button, saving && styles.dim]}
          onPress={() => void save()}
          disabled={saving}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Save outfit</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: 16, gap: 8, alignItems: 'center' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 21 },
  piece: {
    width: '70%',
    aspectRatio: 1.2,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 10,
  },
  image: { width: '100%', height: '100%' },
  lock: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  lockOn: { backgroundColor: colors.accent },
  hint: { fontSize: 13, color: colors.muted, marginTop: 4 },
  error: { fontSize: 14, color: colors.danger },
  actions: { flexDirection: 'row', gap: 8, padding: 16 },
  button: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  dim: { opacity: 0.5 },
  primaryText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  buttonText: { fontSize: 15, fontWeight: '600', color: colors.accent },
});
