import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dayKey } from '../../calendar';
import { CanvasPreview } from '../../CanvasPreview';
import { useCloset } from '../../ClosetContext';
import type { Item } from '../../items';
import { OutfitCollage } from '../../OutfitCollage';
import type { Outfit } from '../../outfits';
import { colors } from '../../theme';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// The days of a month's grid, Monday first, padded with nulls.
function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= count; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// What you wore, or plan to wear, each day.
export default function CalendarScreen() {
  const { days, outfits, items, setDay } = useCloset();
  const today = new Date();
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byId = new Map(items.map((item) => [item.id, item]));
  const outfitItems = (outfit: Outfit) => outfit.itemIds.flatMap((id) => byId.get(id) ?? []);
  const outfitFor = (key: string) => outfits.find((o) => o.id === days[key]);

  const shift = (delta: number) =>
    setMonth(({ year, month: m }) => {
      const d = new Date(year, m + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const choose = async (outfitId: string | null) => {
    if (!picking) return;
    setError(null);
    try {
      await setDay(picking, outfitId);
      setPicking(null);
    } catch (e) {
      setError(`Couldn't save: ${errorMessage(e)}`);
    }
  };

  const title = new Date(month.year, month.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const todayKey = dayKey(today);
  const pickingDate = picking ? new Date(`${picking}T12:00:00`) : null;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.monthRow}>
        <Pressable onPress={() => shift(-1)} hitSlop={12} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </Pressable>
        <Text style={styles.month}>{title}</Text>
        <Pressable onPress={() => shift(1)} hitSlop={12} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={22} color={colors.accent} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {monthGrid(month.year, month.month).map((date, i) => {
          if (!date) return <View key={`pad-${i}`} style={styles.cell} />;
          const key = dayKey(date);
          const outfit = outfitFor(key);
          return (
            <Pressable
              key={key}
              style={[styles.cell, styles.day, key === todayKey && styles.today]}
              onPress={() => setPicking(key)}
              accessibilityLabel={`${date.toDateString()}${outfit ? `, ${outfit.name || 'outfit'}` : ''}`}
            >
              <Text style={[styles.dayNumber, key === todayKey && styles.todayNumber]}>
                {date.getDate()}
              </Text>
              {outfit && <Thumb items={outfitItems(outfit)} />}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>Tap a day to choose its outfit.</Text>

      <Modal
        visible={picking !== null}
        animationType="slide"
        onRequestClose={() => setPicking(null)}
      >
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {pickingDate?.toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
            <Pressable onPress={() => setPicking(null)} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.choices}>
            {outfits.length === 0 && (
              <Pressable
                onPress={() => {
                  setPicking(null);
                  router.push('/outfit/new');
                }}
              >
                <Text style={styles.link}>You have no outfits yet. Create one</Text>
              </Pressable>
            )}
            {outfits.map((outfit) => {
              const chosen = picking !== null && days[picking] === outfit.id;
              return (
                <Pressable
                  key={outfit.id}
                  style={[styles.choice, chosen && styles.chosen]}
                  onPress={() => void choose(outfit.id)}
                  accessibilityState={{ selected: chosen }}
                  accessibilityLabel={outfit.name || 'Outfit'}
                >
                  {Object.keys(outfit.layout).length > 0 ? (
                    <CanvasPreview items={outfitItems(outfit)} layout={outfit.layout} />
                  ) : (
                    <OutfitCollage items={outfitItems(outfit)} />
                  )}
                  <Text style={styles.choiceName} numberOfLines={1}>
                    {outfit.name || 'Outfit'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {error && <Text style={styles.error}>{error}</Text>}
          {picking && days[picking] && (
            <Pressable style={styles.clear} onPress={() => void choose(null)}>
              <Text style={styles.clearText}>Clear this day</Text>
            </Pressable>
          )}
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

// The day's outfit, small.
function Thumb({ items }: { items: Item[] }) {
  if (items.length === 0) return <View style={styles.dot} />;
  return (
    <View style={styles.thumb}>
      <OutfitCollage items={items} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingTop: 0 },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  month: { fontSize: 17, fontWeight: '600', color: colors.text },
  week: { flexDirection: 'row' },
  weekday: { width: '14.28%', textAlign: 'center', fontSize: 12, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  cell: { width: '14.28%', aspectRatio: 0.62, padding: 2 },
  day: { alignItems: 'center', borderRadius: 6 },
  today: { backgroundColor: '#E7E7F8' },
  dayNumber: { fontSize: 13, color: colors.text, marginTop: 2 },
  todayNumber: { fontWeight: '700', color: colors.accent },
  thumb: { width: '100%', marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 6 },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 12 },
  sheet: { flex: 1, backgroundColor: colors.background },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  link: { fontSize: 16, color: colors.accent },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  choice: {
    width: '31%',
    gap: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 2,
  },
  chosen: { borderColor: colors.accent },
  choiceName: { fontSize: 13, color: colors.text, textAlign: 'center' },
  error: { fontSize: 14, color: colors.danger, textAlign: 'center', padding: 8 },
  clear: { margin: 16, paddingVertical: 12, alignItems: 'center' },
  clearText: { fontSize: 15, fontWeight: '600', color: colors.danger },
});
