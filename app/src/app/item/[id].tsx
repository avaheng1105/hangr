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
import { NAME_MAX_CHARS, NOTES_MAX_CHARS } from '../../closet';
import {
  SECTIONS,
  displayImage,
  displayName,
  needsReview,
  sectionOf,
  subcategoryOf,
  type Item,
} from '../../items';
import { ReviewSheet } from '../../ReviewSheet';
import { colors } from '../../theme';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// One item: its image, kind, name and notes, and a way to delete it.
export default function ItemDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items } = useCloset();
  const item = items.find((i) => i.id === id);

  if (!item) {
    return (
      <View style={styles.centred}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={styles.muted}>This item isn&apos;t in your wardrobe any more.</Text>
      </View>
    );
  }
  // Keyed so the form starts fresh if a refresh brings new details.
  return <Details key={item.id} item={item} />;
}

function Details({ item }: { item: Item }) {
  const { review, regenerate, update, remove } = useCloset();
  const [customName, setCustomName] = useState(item.customName);
  const [notes, setNotes] = useState(item.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const working = item.status === 'uploading' || item.status === 'processing';
  const hasImage = item.status === 'ready' || item.assets.cutout !== undefined;
  const section = sectionOf(item.category);
  const subcategory = subcategoryOf(item);
  const changed = customName.trim() !== item.customName || notes.trim() !== item.notes;

  const save = async (changes: Parameters<typeof update>[1]) => {
    setSaving(true);
    setError(null);
    try {
      await update(item, changes);
    } catch (e) {
      setError(`Couldn't save: ${errorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    const doDelete = async () => {
      try {
        await remove(item);
        router.back();
      } catch (e) {
        setError(`Couldn't delete: ${errorMessage(e)}`);
      }
    };
    const question = `Delete ${item.name.toLowerCase()} from your wardrobe? This can't be undone.`;
    // Alert has no buttons on web.
    if (Platform.OS === 'web') {
      if (window.confirm(question)) void doDelete();
      return;
    }
    Alert.alert('Delete item', question, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: item.name }} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.frame}>
          {hasImage && (
            <Image source={displayImage(item)} style={styles.image} resizeMode="contain" />
          )}
          {working && (
            <View style={styles.overlay}>
              <ActivityIndicator />
              <Text style={styles.muted}>Processing</Text>
            </View>
          )}
          {item.status === 'failed' && (
            <View style={styles.overlay}>
              <Text style={styles.muted}>Couldn&apos;t process this photo</Text>
              {item.error && <Text style={styles.small}>{item.error}</Text>}
            </View>
          )}
        </View>

        {needsReview(item) && (
          <Pressable
            style={styles.reviewBanner}
            onPress={() => setReviewing(true)}
            accessibilityRole="button"
          >
            <Text style={styles.reviewText}>This image needs a look. Tap to review it.</Text>
          </Pressable>
        )}

        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          {SECTIONS.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              selected={section?.key === s.key}
              // Moving to another section starts with its main kind.
              onPress={() =>
                section?.key !== s.key &&
                void save({ category: s.categories[0], subcategory: null })
              }
            />
          ))}
        </View>
        {section && (
          <>
            <Text style={styles.label}>Type</Text>
            <View style={styles.chips}>
              {section.subcategories.map((s) => (
                <Chip
                  key={s.key}
                  label={s.label}
                  selected={subcategory === s.key}
                  onPress={() => void save({ category: s.category, subcategory: s.key })}
                />
              ))}
            </View>
          </>
        )}

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={customName}
          onChangeText={setCustomName}
          placeholder={
            item.category === 'auto'
              ? 'e.g. Puppy tee'
              : displayName(item.category, '', item.subcategory)
          }
          placeholderTextColor="#9A9DAA"
          maxLength={NAME_MAX_CHARS}
        />

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.notes]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Size, where it's from, how it fits..."
          placeholderTextColor="#9A9DAA"
          maxLength={NOTES_MAX_CHARS}
          multiline
        />

        {changed && (
          <Pressable
            style={[styles.button, styles.primary, saving && styles.pressed]}
            onPress={() => void save({ customName: customName.trim(), notes: notes.trim() })}
            disabled={saving}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Save</Text>
          </Pressable>
        )}
        {saving && <ActivityIndicator />}
        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.button} onPress={confirmDelete} accessibilityRole="button">
          <Text style={styles.deleteText}>Delete item</Text>
        </Pressable>
      </ScrollView>

      <ReviewSheet
        item={reviewing ? item : null}
        onClose={() => setReviewing(false)}
        onReview={review}
        onRegenerate={regenerate}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 8, paddingBottom: 40 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  frame: {
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
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
    padding: 16,
  },
  muted: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  small: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  reviewBanner: { backgroundColor: '#FFF6E5', borderRadius: 8, padding: 12 },
  reviewText: { fontSize: 14, color: '#5C4200', fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  notes: { minHeight: 80, textAlignVertical: 'top' },
  button: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  pressed: { opacity: 0.6 },
  primaryText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  deleteText: { fontSize: 15, fontWeight: '600', color: colors.danger },
  error: { fontSize: 14, color: colors.danger },
});
