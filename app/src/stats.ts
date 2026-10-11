import { dayKey, type OutfitDays } from './calendar';
import { SECTIONS, sectionOf, type Item } from './items';
import type { Outfit } from './outfits';

export type SectionCount = { key: string; label: string; count: number };
export type Worn = { item: Item; count: number };

export type ClosetStats = {
  items: number;
  outfits: number;
  // Days up to today with an outfit on the calendar.
  daysWorn: number;
  // Every section, in wardrobe order, plus "Not set" if any item has no kind.
  sections: SectionCount[];
  // Null until an outfit has been worn.
  mostWorn: Worn | null;
  leastWorn: Worn | null;
};

// Counts for the About Me page. An item is worn once for each day up to
// today whose outfit includes it; days ahead are plans, not wears.
export function closetStats(
  items: Item[],
  outfits: Outfit[],
  days: OutfitDays,
  today = new Date(),
): ClosetStats {
  const sections = SECTIONS.map((s) => ({
    key: s.key,
    label: s.label,
    count: items.filter((item) => sectionOf(item.category)?.key === s.key).length,
  }));
  const unset = items.filter((item) => item.category === 'auto').length;
  if (unset > 0) sections.push({ key: 'auto', label: 'Not set', count: unset });

  const todayKey = dayKey(today);
  const byId = new Map(outfits.map((o) => [o.id, o]));
  const wears = new Map<string, number>();
  let daysWorn = 0;
  for (const [day, outfitId] of Object.entries(days)) {
    const outfit = byId.get(outfitId);
    // 'YYYY-MM-DD' strings sort as dates.
    if (!outfit || day > todayKey) continue;
    daysWorn++;
    for (const id of outfit.itemIds) wears.set(id, (wears.get(id) ?? 0) + 1);
  }

  let mostWorn: Worn | null = null;
  let leastWorn: Worn | null = null;
  if (daysWorn > 0) {
    for (const item of items) {
      if (item.status !== 'ready') continue;
      const count = wears.get(item.id) ?? 0;
      if (!mostWorn || count > mostWorn.count) mostWorn = { item, count };
      if (!leastWorn || count < leastWorn.count) leastWorn = { item, count };
    }
    // With one item, or everything worn alike, there's no least worn.
    if (mostWorn && leastWorn && mostWorn.count === leastWorn.count) leastWorn = null;
    if (mostWorn?.count === 0) mostWorn = null;
  }

  return { items: items.length, outfits: outfits.length, daysWorn, sections, mostWorn, leastWorn };
}
