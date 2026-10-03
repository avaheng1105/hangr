import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NOTE_MAX_CHARS } from './closet';
import { judgeIssues, reviewMessage, type Item, type ReviewResolution } from './items';

type Props = {
  item: Item | null;
  onClose: () => void;
  onReview: (item: Item, resolution: ReviewResolution) => Promise<void>;
  // Starts a regenerate run; the new image shows up in the closet when done.
  onRegenerate: (item: Item, note: string) => Promise<void>;
};

// Shown when the user taps an item flagged for review: their photo next to
// the generated image, with three ways out. Keep clears the flag, Use my
// photo swaps in the original photo with its background removed, and
// Regenerate runs the image model again with an optional note.
export function ReviewSheet({ item, onClose, onReview, onRegenerate }: Props) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setNote('');
    setError(null);
    onClose();
  };

  // Runs one of the three actions, closing the sheet if it worked.
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const issues = item ? judgeIssues(item) : [];

  return (
    <Modal visible={item !== null} animationType="slide" onRequestClose={close}>
      {item && (
        <SafeAreaView style={styles.screen}>
          <View style={styles.header}>
            <Text style={styles.title}>Review {item.name.toLowerCase()}</Text>
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {item.error && (
              <Text style={styles.error}>Your last regenerate didn&apos;t work: {item.error}</Text>
            )}
            <Text style={styles.message}>{reviewMessage(item.meta.enhance.review_reason)}</Text>

            <View style={styles.compare}>
              <Picture label="Your photo" source={item.assets.original} />
              <Picture label="Generated" source={item.assets.cutout ?? item.assets.thumb} />
            </View>

            {issues.length > 0 && (
              <View style={styles.issues}>
                <Text style={styles.label}>Differences found</Text>
                {issues.map((issue) => (
                  <Text key={issue} style={styles.issue}>
                    • {issue}
                  </Text>
                ))}
              </View>
            )}

            <Button
              label="Keep this image"
              onPress={() => run(() => onReview(item, 'kept'))}
              disabled={busy}
              primary
            />
            {item.assets.photoCutout && (
              <Button
                label="Use my photo instead"
                onPress={() => run(() => onReview(item, 'photo'))}
                disabled={busy}
              />
            )}

            <View style={styles.regenerate}>
              <Text style={styles.label}>Or regenerate it</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                placeholder='What to fix (optional), e.g. "plain short sleeves"'
                placeholderTextColor="#9A9DAA"
                maxLength={NOTE_MAX_CHARS}
                editable={!busy}
              />
              <Button
                label="Regenerate"
                onPress={() => run(() => onRegenerate(item, note.trim()))}
                disabled={busy}
              />
              {busy && <ActivityIndicator style={styles.spinner} />}
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          </ScrollView>
        </SafeAreaView>
      )}
    </Modal>
  );
}

function Picture({ label, source }: { label: string; source?: Item['assets']['thumb'] }) {
  return (
    <View style={styles.picture}>
      <View style={styles.frame}>
        {source && <Image source={source} style={styles.image} resizeMode="contain" />}
      </View>
      <Text style={styles.caption}>{label}</Text>
    </View>
  );
}

function Button(props: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        props.primary && styles.primary,
        (pressed || props.disabled) && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, props.primary && styles.primaryText]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F4F8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 18, fontWeight: '600', color: '#1F2433' },
  close: { fontSize: 16, color: '#5B5FC7' },
  body: { padding: 16, gap: 12 },
  message: { fontSize: 15, color: '#1F2433', lineHeight: 21 },
  compare: { flexDirection: 'row', gap: 8 },
  picture: { flex: 1, gap: 6 },
  frame: { aspectRatio: 0.8, backgroundColor: '#FFFFFF', borderRadius: 8, padding: 8 },
  image: { width: '100%', height: '100%' },
  caption: { fontSize: 13, color: '#6B6F7E', textAlign: 'center' },
  issues: { backgroundColor: '#FFF6E5', borderRadius: 8, padding: 12, gap: 4 },
  issue: { fontSize: 14, color: '#5C4200', lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#6B6F7E', marginBottom: 4 },
  regenerate: { marginTop: 12, gap: 8 },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E1E0E8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1F2433',
  },
  button: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5B5FC7',
    paddingVertical: 12,
    alignItems: 'center',
  },
  primary: { backgroundColor: '#5B5FC7' },
  pressed: { opacity: 0.6 },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#5B5FC7' },
  primaryText: { color: '#FFFFFF' },
  spinner: { marginTop: 4 },
  error: { fontSize: 14, color: '#B3261E', lineHeight: 20 },
});
