import type { ImageSourcePropType } from 'react-native';

// Why the pipeline flagged an item (meta.json -> enhance.review_reason).
export type ReviewReason = 'low_score' | 'judge_failed';

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

// Pipeline progress (items.status in Supabase). Sample items are 'ready'.
export type ItemStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export type Item = {
  id: string;
  name: string;
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
  if (reason === 'judge_failed') {
    return "We couldn't check this image against your photo. Take a look to make sure it's the same item.";
  }
  return 'This image may not match your photo exactly. Check the differences below.';
}

// The image the closet shows: the photo cutout once the user picked it.
export function displayThumb(item: Item): ImageSourcePropType {
  return item.resolution === 'photo' && item.assets.photoThumb
    ? item.assets.photoThumb
    : item.assets.thumb;
}
