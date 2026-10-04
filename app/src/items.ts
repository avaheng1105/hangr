import type { ImageSourcePropType } from 'react-native';

// Why the pipeline flagged an item (meta.json -> enhance.review_reason).
export type ReviewReason = 'low_score' | 'judge_failed' | 'style';

// What the user did on the review screen.
export type ReviewResolution = 'kept' | 'photo';

// One judged attempt from meta.json -> enhance.attempts.
export type Attempt = { score?: number; issues?: string[] };

// The parts of the pipeline's meta.json the app reads.
export type ItemMeta = {
  enhance: {
    category?: string;
    attempts?: Attempt[];
    needs_review?: boolean;
    review_reason?: ReviewReason;
  };
};

// Pipeline assets for one item (see pipeline/README.md). The photo_* pair
// is the original photo with its background removed; the pipeline adds it
// only to items it flags for review.
export type ItemAssets = {
  original?: ImageSourcePropType;
  cutout?: ImageSourcePropType;
  thumb: ImageSourcePropType;
  photoCutout?: ImageSourcePropType;
  photoThumb?: ImageSourcePropType;
};

// The kinds of item (items.category in Supabase, pipeline prompts.CATEGORIES).
// 'auto' means not set yet: the pipeline fills it in when it recognises the item.
export const CATEGORIES = [
  'top',
  'outerwear',
  'dress',
  'bottom',
  'skirt',
  'shoes',
  'bag',
  'jewelry',
  'accessory',
] as const;
export type Category = (typeof CATEGORIES)[number] | 'auto';

const CATEGORY_LABELS: Record<Category, string> = {
  top: 'Top',
  outerwear: 'Outerwear',
  dress: 'Dress',
  bottom: 'Bottoms',
  skirt: 'Skirt',
  shoes: 'Shoes',
  bag: 'Bag',
  jewelry: 'Jewellery',
  accessory: 'Accessory',
  auto: 'Not set',
};

// Sorts items head to toe (by kind), items without a kind last.
const KIND_ORDER: Category[] = [...CATEGORIES, 'auto'];
export const byKind = (a: { category: Category }, b: { category: Category }) =>
  KIND_ORDER.indexOf(a.category) - KIND_ORDER.indexOf(b.category);

export function categoryLabel(category: Category): string {
  return CATEGORY_LABELS[category];
}

// The wardrobe's sections, each split into subcategories (items.subcategory
// in Supabase, pipeline prompts.SUBCATEGORIES). A subcategory also decides
// the item's kind: a jacket is filed under tops but styled as outerwear.
export type Subcategory = { key: string; label: string; category: Category };
export type Section = {
  key: string;
  label: string;
  // The kinds of item the section holds; the first is the default.
  categories: Category[];
  subcategories: Subcategory[];
};

const sub = (category: Category, ...entries: [string, string][]): Subcategory[] =>
  entries.map(([key, label]) => ({ key, label, category }));

export const SECTIONS: Section[] = [
  {
    key: 'tops',
    label: 'Tops',
    categories: ['top', 'outerwear'],
    subcategories: [
      ...sub(
        'top',
        ['tshirt', 'T-shirt'],
        ['shirt', 'Shirt'],
        ['blouse', 'Blouse'],
        ['sleeveless', 'Sleeveless'],
        ['sweater', 'Sweater'],
        ['hoodie', 'Hoodie'],
      ),
      ...sub(
        'outerwear',
        ['jacket', 'Jacket'],
        ['coat', 'Coat'],
        ['blazer', 'Blazer'],
        ['cardigan', 'Cardigan'],
      ),
    ],
  },
  {
    key: 'bottoms',
    label: 'Bottoms',
    categories: ['bottom', 'skirt'],
    subcategories: [
      ...sub(
        'bottom',
        ['jeans', 'Jeans'],
        ['trousers', 'Trousers'],
        ['shorts', 'Shorts'],
        ['leggings', 'Leggings'],
      ),
      ...sub('skirt', ['skirt', 'Skirt']),
    ],
  },
  {
    key: 'dresses',
    label: 'Dresses',
    categories: ['dress'],
    subcategories: sub(
      'dress',
      ['mini_dress', 'Mini'],
      ['midi_dress', 'Midi'],
      ['maxi_dress', 'Maxi'],
      ['jumpsuit', 'Jumpsuit'],
    ),
  },
  {
    key: 'shoes',
    label: 'Shoes',
    categories: ['shoes'],
    subcategories: sub(
      'shoes',
      ['sneakers', 'Sneakers'],
      ['heels', 'Heels'],
      ['flats', 'Flats'],
      ['boots', 'Boots'],
      ['sandals', 'Sandals'],
    ),
  },
  {
    key: 'bags',
    label: 'Bags',
    categories: ['bag'],
    subcategories: sub(
      'bag',
      ['handbag', 'Handbag'],
      ['shoulder_bag', 'Shoulder bag'],
      ['tote', 'Tote'],
      ['backpack', 'Backpack'],
      ['clutch', 'Clutch'],
    ),
  },
  {
    key: 'accessories',
    label: 'Accessories',
    categories: ['accessory'],
    subcategories: sub(
      'accessory',
      ['hat', 'Hat'],
      ['belt', 'Belt'],
      ['scarf', 'Scarf'],
      ['sunglasses', 'Sunglasses'],
      ['hair_accessory', 'Hair accessory'],
    ),
  },
  {
    key: 'jewellery',
    label: 'Jewellery',
    categories: ['jewelry'],
    subcategories: sub(
      'jewelry',
      ['necklace', 'Necklace'],
      ['earrings', 'Earrings'],
      ['bracelet', 'Bracelet'],
      ['ring', 'Ring'],
      ['watch', 'Watch'],
    ),
  },
];

export function sectionOf(category: Category): Section | undefined {
  return SECTIONS.find((section) => section.categories.includes(category));
}

export function findSubcategory(key: string | null): Subcategory | undefined {
  if (!key) return undefined;
  for (const section of SECTIONS) {
    const found = section.subcategories.find((s) => s.key === key);
    if (found) return found;
  }
  return undefined;
}

// An item's subcategory. A skirt is a skirt even before one is set.
export function subcategoryOf(item: { category: Category; subcategory: string | null }) {
  return item.subcategory ?? (item.category === 'skirt' ? 'skirt' : null);
}

// Pipeline progress (items.status in Supabase). Sample items are 'ready'.
export type ItemStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export type Item = {
  id: string;
  // What the closet shows: the user's name for it, else its kind.
  name: string;
  category: Category;
  // One of SECTIONS' subcategory keys, or null if not set.
  subcategory: string | null;
  // The user's own name and notes (empty if not set).
  customName: string;
  notes: string;
  status: ItemStatus;
  assets: ItemAssets;
  meta: ItemMeta;
  resolution?: ReviewResolution;
  // Why the last run failed. A failed regenerate keeps the previous image.
  error?: string;
};

export function needsReview(item: Item): boolean {
  return (
    item.status === 'ready' &&
    item.meta.enhance.needs_review === true &&
    item.resolution === undefined
  );
}

// The judge's list of differences for the attempt that was kept.
export function judgeIssues(item: Item): string[] {
  const judged = (item.meta.enhance.attempts ?? []).filter((a) => a.score !== undefined);
  if (judged.length === 0) return [];
  const best = judged.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a));
  return best.issues ?? [];
}

export function reviewMessage(reason: ReviewReason | undefined): string {
  if (reason === 'style') {
    return "This image matches your photo but isn't shown like the rest of your closet. Check the notes below.";
  }
  if (reason === 'judge_failed') {
    return "We couldn't check this image against your photo. Take a look to make sure it's the same item.";
  }
  return 'This image may not match your photo exactly. Check the differences below.';
}

// The name the closet shows for an item.
export function displayName(
  category: Category,
  customName: string,
  subcategory: string | null = null,
): string {
  return (
    customName.trim() ||
    findSubcategory(subcategory)?.label ||
    (category === 'auto' ? 'Item' : categoryLabel(category))
  );
}

// The full-size image of an item (see displayThumb).
export function displayImage(item: Item): ImageSourcePropType {
  if (item.resolution === 'photo' && item.assets.photoCutout) return item.assets.photoCutout;
  return item.assets.cutout ?? item.assets.thumb;
}

// The image the closet shows: the photo cutout once the user picked it.
export function displayThumb(item: Item): ImageSourcePropType {
  return item.resolution === 'photo' && item.assets.photoThumb
    ? item.assets.photoThumb
    : item.assets.thumb;
}
