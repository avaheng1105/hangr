import type { Category, Item } from './items';

// How likely an optional piece is to be added, when the wardrobe has one.
const OPTIONAL: [Category, number][] = [
  ['outerwear', 0.4],
  ['shoes', 1],
  ['bag', 0.5],
  ['jewelry', 0.5],
  ['accessory', 0.3],
];

const pick = <T>(list: T[], random: () => number): T | undefined =>
  list[Math.floor(random() * list.length)];

// A random outfit from the wardrobe: a dress, or a top with a bottom or
// skirt, plus some optional pieces. `locked` items always stay in, and fill
// their slot. Items whose type isn't set are left out.
export function shuffleOutfit(
  items: Item[],
  locked: Item[] = [],
  random: () => number = Math.random,
): Item[] {
  const ready = items.filter((item) => item.status === 'ready' && item.category !== 'auto');
  const of = (...kinds: Category[]) => ready.filter((item) => kinds.includes(item.category));
  const lockedOf = (...kinds: Category[]) => locked.filter((item) => kinds.includes(item.category));
  const outfit: Item[] = [...locked];
  const add = (kinds: Category[]) => {
    if (lockedOf(...kinds).length > 0) return;
    const choice = pick(of(...kinds), random);
    if (choice) outfit.push(choice);
  };

  const dresses = of('dress');
  const separates = Math.min(of('top').length, of('bottom', 'skirt').length);
  const lockedDress = lockedOf('dress').length > 0;
  const lockedSeparate = lockedOf('top', 'bottom', 'skirt').length > 0;
  // Dress or separates, in proportion to how many of each there are.
  const dress =
    lockedDress ||
    (!lockedSeparate && dresses.length > 0 && random() < dresses.length / (dresses.length + separates));
  if (dress) {
    add(['dress']);
  } else {
    add(['top']);
    add(['bottom', 'skirt']);
  }
  for (const [kind, chance] of OPTIONAL) {
    if (lockedOf(kind).length === 0 && random() < chance) add([kind]);
  }
  return outfit;
}
