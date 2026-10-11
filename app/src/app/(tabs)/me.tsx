import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '../../AuthContext';
import { useCloset } from '../../ClosetContext';
import { displayThumb } from '../../items';
import { closetStats, type Worn } from '../../stats';
import { colors } from '../../theme';

// About Me: who you're signed in as and your closet in numbers.
export default function AboutMe() {
  const { items, outfits, days, live } = useCloset();
  const { email, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const stats = closetStats(items, outfits, days);
  const biggest = Math.max(1, ...stats.sections.map((s) => s.count));

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color={colors.muted} />
        </View>
        <View style={styles.profileText}>
          <Text style={styles.name} numberOfLines={1}>
            {email ? email.split('@')[0] : 'Sample closet'}
          </Text>
          <Text style={styles.subtle} numberOfLines={1}>
            {email ?? 'Not signed in: the backend is not set up in this build.'}
          </Text>
        </View>
      </View>

      <View style={styles.totals}>
        <Total value={stats.items} label={stats.items === 1 ? 'item' : 'items'} />
        <Total value={stats.outfits} label={stats.outfits === 1 ? 'outfit' : 'outfits'} />
        <Total value={stats.daysWorn} label={stats.daysWorn === 1 ? 'day worn' : 'days worn'} />
      </View>

      <Text style={styles.heading}>Your closet</Text>
      <View style={styles.card}>
        {stats.sections.map((s) => (
          <View key={s.key} style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>{s.label}</Text>
            <View style={styles.track}>
              {s.count > 0 && (
                <View style={[styles.bar, { width: `${(s.count / biggest) * 100}%` }]} />
              )}
            </View>
            <Text style={styles.sectionCount}>{s.count}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.heading}>Wear</Text>
      {stats.mostWorn || stats.leastWorn ? (
        <View style={styles.wornRow}>
          {stats.mostWorn && <WornCard title="Most worn" worn={stats.mostWorn} />}
          {stats.leastWorn && <WornCard title="Least worn" worn={stats.leastWorn} />}
        </View>
      ) : (
        <Text style={[styles.card, styles.subtle]}>
          Put outfits on the calendar to see what you wear most.
        </Text>
      )}

      <Text style={styles.heading}>Settings</Text>
      <View style={styles.card}>
        <Setting label="Closet" value={live ? 'Saved to your account' : 'Sample closet'} />
        <Setting label="Version" value={Constants.expoConfig?.version ?? '-'} last={!email} />
        {email && (
          <Pressable
            style={styles.setting}
            onPress={() => confirmSignOut(signOut, setError)}
            accessibilityRole="button"
          >
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

function confirmSignOut(signOut: () => Promise<void>, setError: (e: string | null) => void) {
  const run = () => {
    setError(null);
    signOut().catch((e) =>
      setError(`Couldn't sign out: ${e instanceof Error ? e.message : String(e)}`),
    );
  };
  // Alert has no buttons on web.
  if (Platform.OS === 'web') return run();
  Alert.alert('Sign out?', 'Your closet stays in your account.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: run },
  ]);
}

function Total({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.total}>
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={styles.subtle}>{label}</Text>
    </View>
  );
}

function WornCard({ title, worn }: { title: string; worn: Worn }) {
  const times =
    worn.count === 0 ? 'Not worn yet' : worn.count === 1 ? 'Worn once' : `Worn ${worn.count} times`;
  return (
    <Pressable
      style={styles.worn}
      onPress={() => router.push(`/item/${worn.item.id}`)}
      accessibilityLabel={`${title}: ${worn.item.name}, ${times}`}
    >
      <Text style={styles.wornTitle}>{title}</Text>
      <Image source={displayThumb(worn.item)} style={styles.wornImage} resizeMode="contain" />
      <Text style={styles.wornName} numberOfLines={1}>
        {worn.item.name}
      </Text>
      <Text style={styles.subtle}>{times}</Text>
    </Pressable>
  );
}

function Setting({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.setting, !last && styles.settingDivider]}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.subtle}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingTop: 4, paddingBottom: 32 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileText: { flex: 1, gap: 2 },
  name: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtle: { fontSize: 13, color: colors.muted },
  totals: { flexDirection: 'row', gap: 8 },
  total: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  totalValue: { fontSize: 24, fontWeight: '700', color: colors.accent },
  heading: { fontSize: 17, fontWeight: '600', color: colors.text, marginTop: 24, marginBottom: 8 },
  card: { borderRadius: 10, backgroundColor: colors.surface, padding: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  sectionLabel: { width: 88, fontSize: 14, color: colors.text },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.background },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  sectionCount: { width: 24, textAlign: 'right', fontSize: 14, color: colors.muted },
  wornRow: { flexDirection: 'row', gap: 8 },
  worn: { flex: 1, borderRadius: 10, backgroundColor: colors.surface, padding: 12, gap: 4 },
  wornTitle: { fontSize: 13, fontWeight: '600', color: colors.muted },
  wornImage: { width: '100%', height: 120, marginVertical: 4 },
  wornName: { fontSize: 15, fontWeight: '600', color: colors.text },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  settingDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  settingLabel: { fontSize: 15, color: colors.text },
  signOut: { fontSize: 15, fontWeight: '600', color: colors.danger },
  error: { fontSize: 14, color: colors.danger, marginTop: 8, textAlign: 'center' },
});
