import type { Category, Item } from './items';
import type { Placement } from './outfits';

// Where each kind of item starts on a fresh canvas: roughly how it's worn,
// with bags and accessories off to the side.
const START: Record<Category, Omit<Placement, 'z'>> = {
  outerwear: { x: 0.32, y: 0.3, scale: 0.45 },
  top: { x: 0.5, y: 0.28, scale: 0.42 },
  dress: { x: 0.5, y: 0.42, scale: 0.5 },
  bottom: { x: 0.5, y: 0.66, scale: 0.4 },
  skirt: { x: 0.5, y: 0.62, scale: 0.38 },
  shoes: { x: 0.5, y: 0.9, scale: 0.26 },
  bag: { x: 0.82, y: 0.58, scale: 0.28 },
  jewelry: { x: 0.18, y: 0.14, scale: 0.18 },
  accessory: { x: 0.82, y: 0.16, scale: 0.24 },
  auto: { x: 0.5, y: 0.5, scale: 0.35 },
};

// The saved placement of each item, or its starting spot. Items of the same
// kind are fanned out so none hides another.
export function layoutFor(
  items: Item[],
  saved: Record<string, Placement>,
): Record<string, Placement> {
  const seen = new Map<Category, number>();
  return Object.fromEntries(
    items.map((item, index) => {
      if (saved[item.id]) return [item.id, saved[item.id]];
      const nth = seen.get(item.category) ?? 0;
      seen.set(item.category, nth + 1);
      const start = START[item.category];
      const x = Math.min(0.95, Math.max(0.05, start.x + nth * 0.12));
      return [item.id, { ...start, x, z: index }];
    }),
  );
}

export const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));
