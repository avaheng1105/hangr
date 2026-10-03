import { FunctionsHttpError } from '@supabase/supabase-js';

import type { Item, ItemAssets, ItemMeta, ItemStatus, ReviewResolution } from './items';
import { SAMPLE_ITEMS } from './sampleItems';
import { supabase } from './supabase';

// Where the closet's items come from: Supabase when it's configured,
// otherwise the bundled sample items (review choices then live in memory).
export type Closet = {
  // False for the sample closet: no uploads, no regenerate.
  live: boolean;
  load(): Promise<Item[]>;
  // Uploads a photo and starts the pipeline on it.
  add(photoUri: string, mimeType?: string): Promise<void>;
  review(item: Item, resolution: ReviewResolution): Promise<Item>;
  // Starts a regenerate run (one image call, one judge call). The item is
  // 'processing' until the worker writes the new image.
  regenerate(item: Item, note: string): Promise<Item>;
};

export class NotConnectedError extends Error {}

// The user's note goes into the image prompt; the backend trims it to the
// same length (pipeline.NOTE_MAX_CHARS).
export const NOTE_MAX_CHARS = 200;

const sampleCloset: Closet = {
  live: false,
  load: async () => SAMPLE_ITEMS,
  add: async () => {
    throw new NotConnectedError('Adding items needs the Hangr backend.');
  },
  review: async (item, resolution) => ({ ...item, resolution }),
  regenerate: async () => {
    throw new NotConnectedError(
      "Regenerating needs the Hangr backend, which isn't set up in this build. You can keep the image or use your photo for now.",
    );
  },
};

type Row = {
  id: string;
  category: string;
  status: ItemStatus;
  meta: ItemMeta | null;
  review_resolution: ReviewResolution | null;
  error: string | null;
  item_assets: { kind: string; path: string }[];
};

const ASSET_KEYS: Record<string, keyof ItemAssets> = {
  'original.webp': 'original',
  'cutout.png': 'cutout',
  'thumb.webp': 'thumb',
  'photo_cutout.png': 'photoCutout',
  'photo_thumb.webp': 'photoThumb',
};

const SIGNED_URL_SECONDS = 60 * 60;
const STALE_UPLOAD_MS = 10 * 60 * 1000;

function itemName(category: string): string {
  return category === 'auto' ? 'Item' : category[0].toUpperCase() + category.slice(1);
}

// The `error` field of a failed Edge Function call, or a generic message.
async function functionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === 'string') return new Error(body.error);
    } catch {
      // not JSON
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

function liveCloset(client: NonNullable<typeof supabase>): Closet {
  // A guest account per device for now; it can be linked to an email later.
  const signIn = async () => {
    const { data } = await client.auth.getSession();
    if (data.session) return data.session.user.id;
    const { data: anon, error } = await client.auth.signInAnonymously();
    if (error || !anon.user) throw error ?? new Error('Could not sign in');
    return anon.user.id;
  };

  const startJob = async (body: object) => {
    const { error } = await client.functions.invoke('jobs', { body });
    if (error) throw await functionError(error);
  };

  return {
    live: true,

    async load() {
      await signIn();
      // An add that lost its connection mid-upload leaves an item that never
      // started processing; clear those out rather than showing them forever.
      await client
        .from('items')
        .delete()
        .eq('status', 'uploading')
        .lt('created_at', new Date(Date.now() - STALE_UPLOAD_MS).toISOString());
      const { data, error } = await client
        .from('items')
        .select('id, category, status, meta, review_resolution, error, item_assets(kind, path)')
        .order('created_at', { ascending: false })
        .returns<Row[]>();
      if (error) throw error;

      const paths = data.flatMap((row) => row.item_assets.map((a) => a.path));
      const urls = new Map<string, string>();
      if (paths.length > 0) {
        const signed = await client.storage
          .from('items')
          .createSignedUrls(paths, SIGNED_URL_SECONDS);
        if (signed.error) throw signed.error;
        for (const s of signed.data) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
      }

      return data.map((row) => {
        const assets: Partial<ItemAssets> = {};
        for (const asset of row.item_assets) {
          const key = ASSET_KEYS[asset.kind];
          const uri = urls.get(asset.path);
          if (key && uri) assets[key] = { uri };
        }
        return {
          id: row.id,
          name: itemName(row.category),
          status: row.status,
          assets: { ...assets, thumb: assets.thumb ?? assets.original ?? { uri: '' } },
          meta: row.meta ?? { enhance: {} },
          resolution: row.review_resolution ?? undefined,
          error: row.error ?? undefined,
        };
      });
    },

    async add(photoUri, mimeType = 'image/jpeg') {
      const userId = await signIn();
      const { data: item, error } = await client
        .from('items')
        .insert({ category: 'auto' })
        .select('id')
        .single();
      if (error) throw error;
      try {
        const photo = await (await fetch(photoUri)).arrayBuffer();
        const upload = await client.storage
          .from('items')
          .upload(`${userId}/${item.id}/upload`, photo, { contentType: mimeType });
        if (upload.error) throw upload.error;
        await startJob({ item_id: item.id, type: 'process' });
      } catch (e) {
        // Don't leave an item stuck in 'uploading' (the job never started).
        await client.from('items').delete().eq('id', item.id);
        throw e;
      }
    },

    async review(item, resolution) {
      const { error } = await client
        .from('items')
        .update({ review_resolution: resolution })
        .eq('id', item.id);
      if (error) throw error;
      return { ...item, resolution };
    },

    async regenerate(item, note) {
      await startJob({ item_id: item.id, type: 'regenerate', note });
      return { ...item, status: 'processing', error: undefined };
    },
  };
}

export const closet: Closet = supabase ? liveCloset(supabase) : sampleCloset;
