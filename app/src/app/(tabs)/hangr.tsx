import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CanvasBoard } from '../../CanvasBoard';
import { Chip } from '../../Chip';
import { useCloset } from '../../ClosetContext';
import type { Item } from '../../items';
import {
  ALL,
  DRESSES,
  ROW_LABELS,
  ROW_SETS,
  randomIndex,
  rowItems,
  rowOptions,
  visibleRows,
  type RowCount,
  type RowKey,
} from '../../look';
import { OutfitsGrid } from '../../OutfitsGrid';
import { SwipeRow } from '../../SwipeRow';
import { colors } from '../../theme';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Tab = 'look' | 'canvas' | 'outfits';
const TABS: { key: Tab; label: string }[] = [
  { key: 'look', label: 'Hangr' },
  { key: 'canvas', label: 'Canvas' },
  { key: 'outfits', label: 'Outfits' },
];

const perRow = <T,>(value: T): Record<RowKey, T> => ({
  outerwear: value,
  top: value,
  bottom: value,
  shoes: value,
});

// Put looks together by swiping through each kind of item, try them on the
// canvas, and keep the ones you like as outfits.
export default function Hangr() {
  const { items, saveOutfit, saveLayout } = useCloset();
  const [tab, setTab] = useState<Tab>('look');
  const [count, setCount] = useState<RowCount>(3);
  const [filters, setFilters] = useState(() => perRow(ALL));
  const [indexes, setIndexes] = useState(() => perRow(0));
  const [locked, setLocked] = useState(() => perRow(false));
  const [filtering, setFiltering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = visibleRows(count, filters);
  const lists = Object.fromEntries(
    rows.map((row) => [row, rowItems(items, row, filters[row])]),
  ) as Record<RowKey, Item[]>;
  // A list can shrink (a filter, a deleted item), so keep each index in range.
  const indexOf = (row: RowKey) => Math.min(indexes[row], Math.max(0, lists[row].length - 1));
  const look = rows.flatMap((row) => lists[row][indexOf(row)] ?? []);

  const setIndex = (row: RowKey, index: number) =>
    setIndexes((current) => ({ ...current, [row]: index }));

  const shuffle = () =>
    setIndexes((current) => {
      const next = { ...current };
      for (const row of rows) {
        if (!locked[row]) next[row] = randomIndex(lists[row].length, indexOf(row));
      }
      return next;
    });

  const setFilter = (row: RowKey, filter: string) => {
    setFilters((current) => ({ ...current, [row]: filter }));
    setIndex(row, 0);
    setLocked((current) => ({ ...current, [row]: false }));
  };

  // Saves the look as an outfit and opens it so it can be named.
  const save = async (layout?: Parameters<typeof saveLayout>[1]) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveOutfit({ name: '', itemIds: look.map((item) => item.id) });
      if (layout) await saveLayout(saved.id, layout);
      router.push(`/outfit/${saved.id}`);
    } catch (e) {
      setError(`Couldn't save: ${errorMessage(e)}`);
      // The board shows its own error.
      if (layout) throw e;
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {tab === 'look' && (
            <Pressable
              onPress={() => setFiltering(true)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Filter rows"
            >
              <Ionicons name="funnel-outline" size={22} color={colors.text} />
            </Pressable>
          )}
        </View>
        <Text style={styles.title}>Hangr</Text>
        <View style={[styles.headerSide, styles.headerRight]}>
          {tab === 'look' && (
            <Pressable
              style={[styles.saveButton, (saving || look.length === 0) && styles.dim]}
              onPress={() => void save()}
              disabled={saving || look.length === 0}
              accessibilityRole="button"
            >
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            style={styles.tab}
            onPress={() => setTab(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
            {tab === t.key && <View style={styles.tabLine} />}
          </Pressable>
        ))}
      </View>

      {tab === 'look' && (
        <>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.rows}>
            {rows.map((row) => (
              <SwipeRow
                key={`${row}-${filters[row]}`}
                items={lists[row]}
                index={indexOf(row)}
                locked={locked[row]}
                emptyLabel={`No ${(filters[row] === DRESSES ? 'dresses' : ROW_LABELS[row]).toLowerCase()} yet`}
                onIndex={(index) => setIndex(row, index)}
                onToggleLock={() => setLocked((current) => ({ ...current, [row]: !current[row] }))}
              />
            ))}
          </View>
          <View style={styles.toolbar}>
            {([2, 3, 4] as const).map((n) => (
              <Pressable
                key={n}
                style={[styles.tool, count === n && styles.toolOn]}
                onPress={() => setCount(n)}
                accessibilityRole="button"
                accessibilityLabel={`${n} rows`}
                accessibilityState={{ selected: count === n }}
              >
                <Dice dots={n} on={count === n} />
              </Pressable>
            ))}
            <Pressable
              style={[styles.tool, styles.shuffle]}
              onPress={shuffle}
              accessibilityRole="button"
              accessibilityLabel="Shuffle"
            >
              <Ionicons name="shuffle" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </>
      )}

      {tab === 'canvas' &&
        (look.length === 0 ? (
          <Text style={styles.hint}>Pick a look on the Hangr tab first.</Text>
        ) : (
          <CanvasBoard
            key={look.map((item) => item.id).join()}
            pieces={look}
            initial={{}}
            onSave={(layout) => save(layout)}
          />
        ))}

      {tab === 'outfits' && <OutfitsGrid />}

      <Modal visible={filtering} animationType="slide" onRequestClose={() => setFiltering(false)}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>What each row shows</Text>
            <Pressable onPress={() => setFiltering(false)} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            {ROW_SETS[count].map((row) => (
              <View key={row} style={styles.filterGroup}>
                <Text style={styles.filterLabel}>
                  {ROW_LABELS[row]}
                  {!rows.includes(row) && ' (hidden while the top row shows dresses)'}
                </Text>
                <View style={styles.chips}>
                  <Chip
                    label="All"
                    selected={filters[row] === ALL}
                    onPress={() => setFilter(row, ALL)}
                  />
                  {rowOptions(row).map((option) => (
                    <Chip
                      key={option.key}
                      label={option.label}
                      selected={filters[row] === option.key}
                      onPress={() => setFilter(row, option.key)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// A die face with 2, 3 or 4 dots, for the row-count buttons.
function Dice({ dots, on }: { dots: 2 | 3 | 4; on: boolean }) {
  const spots: [number, number][] = {
    2: [
      [0, 0],
      [2, 2],
    ] as [number, number][],
    3: [
      [0, 0],
      [1, 1],
      [2, 2],
    ] as [number, number][],
    4: [
      [0, 0],
      [0, 2],
      [2, 0],
      [2, 2],
    ] as [number, number][],
  }[dots];
  const colour = on ? colors.accent : colors.text;
  return (
    <View style={[styles.die, { borderColor: colour }]}>
      {spots.map(([row, col]) => (
        <View
          key={`${row}${col}`}
          style={[styles.dot, { top: 2 + row * 5, left: 2 + col * 5, backgroundColor: colour }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerSide: { width: 72 },
  headerRight: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '700', color: colors.text },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  saveText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  dim: { opacity: 0.4 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabText: { fontSize: 16, color: colors.muted },
  tabTextOn: { color: colors.text, fontWeight: '600' },
  tabLine: {
    position: 'absolute',
    bottom: -1,
    left: 16,
    right: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  rows: { flex: 1, paddingVertical: 8 },
  error: { fontSize: 14, color: colors.danger, textAlign: 'center', padding: 8 },
  toolbar: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 10,
    padding: 6,
    marginBottom: 12,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tool: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolOn: { backgroundColor: '#E7E7F8' },
  shuffle: { backgroundColor: colors.text },
  die: { width: 20, height: 20, borderWidth: 1.5, borderRadius: 4 },
  dot: { position: 'absolute', width: 4, height: 4, borderRadius: 2 },
  hint: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 40 },
  sheet: { flex: 1, backgroundColor: colors.background },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  link: { fontSize: 16, color: colors.accent },
  sheetBody: { paddingHorizontal: 16, gap: 18, paddingBottom: 40 },
  filterGroup: { gap: 8 },
  filterLabel: { fontSize: 14, fontWeight: '600', color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
