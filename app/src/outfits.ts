import { supabase } from './supabase';

// Where an item sits on the outfit canvas: its centre as a fraction of the
// board, its width as a fraction of the board, and stacking order.
export type Placement = { x: number; y: number; scale: number; z: number };

// A named set of items from the closet, in order, with any canvas layout.
export type Outfit = {
  id: string;
  name: string;
  itemIds: string[];
  layout: Record<string, Placement>;
};

export type OutfitDraft = { id?: string; name: string; itemIds: string[] };

// Same limit as the outfits table's check constraint.
export const OUTFIT_NAME_MAX_CHARS = 60;

export type Outfits = {
  load(): Promise<Outfit[]>;
  // Creates the outfit, or updates its name and items if it has an id.
  // Items that stay in keep their canvas placement.
  save(draft: OutfitDraft): Promise<Outfit>;
  remove(id: string): Promise<void>;
  saveLayout(id: string, layout: Record<string, Placement>): Promise<void>;
};

const keepLayout = (layout: Record<string, Placement>, itemIds: string[]) =>
  Object.fromEntries(Object.entries(layout).filter(([id]) => itemIds.includes(id)));

function sampleOutfits(): Outfits {
  let saved: Outfit[] = [{ id: 'sample', name: 'Weekend', itemIds: ['tee', 'jeans'], layout: {} }];
  let next = 1;
  return {
    load: async () => saved,
    async save(draft) {
      const old = saved.find((o) => o.id === draft.id);
      const outfit: Outfit = {
        id: draft.id ?? `outfit-${next++}`,
        name: draft.name.trim(),
        itemIds: draft.itemIds,
        layout: keepLayout(old?.layout ?? {}, draft.itemIds),
      };
      saved = [outfit, ...saved.filter((o) => o.id !== outfit.id)];
      return outfit;
    },
    async remove(id) {
      saved = saved.filter((o) => o.id !== id);
    },
    async saveLayout(id, layout) {
      saved = saved.map((o) => (o.id === id ? { ...o, layout } : o));
    },
  };
}

type Row = {
  id: string;
  name: string | null;
  outfit_items: {
    item_id: string;
    position: number;
    x: number | null;
    y: number | null;
    scale: number | null;
    z: number | null;
  }[];
};

function liveOutfits(client: NonNullable<typeof supabase>): Outfits {
  return {
    async load() {
      const { data, error } = await client
        .from('outfits')
        .select('id, name, outfit_items(item_id, position, x, y, scale, z)')
        .order('created_at', { ascending: false })
        .returns<Row[]>();
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        name: row.name ?? '',
        itemIds: [...row.outfit_items]
          .sort((a, b) => a.position - b.position)
          .map((i) => i.item_id),
        layout: Object.fromEntries(
          row.outfit_items.flatMap((i) =>
            i.x !== null && i.y !== null && i.scale !== null
              ? [[i.item_id, { x: i.x, y: i.y, scale: i.scale, z: i.z ?? 0 }]]
              : [],
          ),
        ),
      }));
    },

    async save(draft) {
      const name = draft.name.trim() || null;
      let id = draft.id;
      if (id) {
        const { error } = await client.from('outfits').update({ name }).eq('id', id);
        if (error) throw error;
        // Take out removed items; the rest keep their canvas placement.
        let removed = client.from('outfit_items').delete().eq('outfit_id', id);
        if (draft.itemIds.length > 0) {
          removed = removed.not('item_id', 'in', `(${draft.itemIds.join(',')})`);
        }
        const { error: removeError } = await removed;
        if (removeError) throw removeError;
      } else {
        const { data, error } = await client.from('outfits').insert({ name }).select('id').single();
        if (error) throw error;
        id = data.id as string;
      }
      if (draft.itemIds.length > 0) {
        // Upserting only the position leaves x, y, scale and z as they were.
        const { error } = await client
          .from('outfit_items')
          .upsert(draft.itemIds.map((item_id, position) => ({ outfit_id: id, item_id, position })));
        if (error) throw error;
      }
      const [saved] = (await this.load()).filter((o) => o.id === id);
      return saved ?? { id, name: name ?? '', itemIds: draft.itemIds, layout: {} };
    },

    async remove(id) {
      const { error } = await client.from('outfits').delete().eq('id', id);
      if (error) throw error;
    },

    async saveLayout(id, layout) {
      for (const [item_id, { x, y, scale, z }] of Object.entries(layout)) {
        const { error } = await client
          .from('outfit_items')
          .update({ x, y, scale, z })
          .eq('outfit_id', id)
          .eq('item_id', item_id);
        if (error) throw error;
      }
    },
  };
}

export const outfits: Outfits = supabase ? liveOutfits(supabase) : sampleOutfits();
