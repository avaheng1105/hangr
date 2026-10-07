import { SECTIONS, subcategoryOf, type Category, type Item, type Subcategory } from './items';

// The Hangr page's swipe rows, head to toe.
export type RowKey = 'outerwear' | 'top' | 'bottom' | 'shoes';

// How many rows the page shows, and which.
export const ROW_SETS: Record<2 | 3 | 4, RowKey[]> = {
  2: ['top', 'bottom'],
  3: ['top', 'bottom', 'shoes'],
  4: ['outerwear', 'top', 'bottom', 'shoes'],
};
export type RowCount = keyof typeof ROW_SETS;

// What a row can be filtered to: everything it holds, one subcategory, or
// (the top row only) dresses, which take the bottom row's place.
export const ALL = 'all';
export const DRESSES = 'dresses';

const ROW_CATEGORIES: Record<RowKey, Category[]> = {
  outerwear: ['outerwear'],
  top: ['top'],
  bottom: ['bottom', 'skirt'],
  shoes: ['shoes'],
};

export const ROW_LABELS: Record<RowKey, string> = {
  outerwear: 'Outerwear',
  top: 'Tops',
  bottom: 'Bottoms',
  shoes: 'Shoes',
};

const allSubcategories = SECTIONS.flatMap((s) => s.subcategories);

// The filter choices for a row (besides All).
export function rowOptions(row: RowKey): { key: string; label: string }[] {
  const subs: Subcategory[] = allSubcategories.filter((s) =>
    ROW_CATEGORIES[row].includes(s.category),
  );
  const options = subs.map((s) => ({ key: s.key, label: s.label }));
  return row === 'top' ? [...options, { key: DRESSES, label: 'Dresses' }] : options;
}

// The items a row swipes through, given its filter.
export function rowItems(items: Item[], row: RowKey, filter: string): Item[] {
  const ready = items.filter((item) => item.status === 'ready');
  if (row === 'top' && filter === DRESSES) return ready.filter((i) => i.category === 'dress');
  const inRow = ready.filter((item) => ROW_CATEGORIES[row].includes(item.category));
  return filter === ALL ? inRow : inRow.filter((item) => subcategoryOf(item) === filter);
}

// The rows shown: a dress in the top row takes the bottom row's place.
export function visibleRows(count: RowCount, filters: Record<RowKey, string>): RowKey[] {
  return ROW_SETS[count].filter((row) => !(row === 'bottom' && filters.top === DRESSES));
}

// A random position in a list of `length`, other than `current` when there's a choice.
export function randomIndex(length: number, current: number, random = Math.random): number {
  if (length <= 1) return 0;
  const next = Math.floor(random() * (length - 1));
  return next >= current ? next + 1 : next;
}
