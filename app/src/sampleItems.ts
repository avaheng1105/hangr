import type { Item } from './items';

// Pipeline outputs from the 2026-10-03 model comparison
// (gemini-3.1-flash-lite-image). Placeholder until the closet loads real items.
//
// The tee really scored 7/10 and passed, but its lettering came out garbled,
// so it's shown flagged here to demo the review flow. Its photo_* files are
// the original photo cut out with BiRefNet, as the pipeline now adds them.
export const SAMPLE_ITEMS: Item[] = [
  {
    id: 'tee',
    status: 'ready',
    name: 'Puppy tee',
    category: 'top',
    customName: 'Puppy tee',
    notes: '',
    assets: {
      original: require('../assets/sample/tee/original.webp'),
      cutout: require('../assets/sample/tee/cutout.png'),
      thumb: require('../assets/sample/tee/thumb.webp'),
      photoCutout: require('../assets/sample/tee/photo_cutout.png'),
      photoThumb: require('../assets/sample/tee/photo_thumb.webp'),
    },
    meta: {
      enhance: {
        category: 'top',
        attempts: [
          {
            score: 6,
            issues: [
              'Correct slight spelling and font distortions in the bottom-right graphic text',
            ],
          },
        ],
        needs_review: true,
        review_reason: 'low_score',
      },
    },
  },
  {
    id: 'jeans',
    status: 'ready',
    name: 'Jeans',
    category: 'bottom',
    customName: '',
    notes: '',
    assets: { thumb: require('../assets/sample/jeans/thumb.webp') },
    meta: { enhance: { category: 'bottom' } },
  },
  {
    id: 'shorts',
    status: 'ready',
    name: 'Shorts',
    category: 'bottom',
    customName: '',
    notes: '',
    assets: { thumb: require('../assets/sample/shorts/thumb.webp') },
    meta: { enhance: { category: 'bottom' } },
  },
  {
    id: 'skirt',
    status: 'ready',
    name: 'Skirt',
    category: 'skirt',
    customName: '',
    notes: '',
    assets: { thumb: require('../assets/sample/skirt/thumb.webp') },
    meta: { enhance: { category: 'skirt' } },
  },
];
