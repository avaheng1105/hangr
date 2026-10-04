import { supabase } from './supabase';

// A named set of items from the closet, in order.
export type Outfit = {
  id: string;
  name: string;
  itemIds: string[];
};

export type OutfitDraft = { id?: string; name: string; itemIds: string[] };

// Same limit as the outfits table's check constraint.
export const OUTFIT_NAME_MAX_CHARS = 60;

export type Outfits = {
  load(): Promise<Outfit[]>;
  // Creates the outfit, or replaces it if it has an id.
  save(draft: OutfitDraft): Promise<Outfit>;
  remove(id: string): Promise<void>;
};

function sampleOutfits(): Outfits {
  let saved: Outfit[] = [{ id: 'sample', name: 'Weekend', itemIds: ['tee', 'jeans'] }];
  let next = 1;
  return {
    load: async () => saved,
    async save(draft) {
      const outfit = { ...draft, id: draft.id ?? `outfit-${next++}` };
      saved = [outfit, ...saved.filter((o) => o.id !== outfit.id)];
      return outfit;
    },
    async remove(id) {
      saved = saved.filter((o) => o.id !== id);
    },
  };
}

type Row = {
  id: string;
  name: string | null;
  outfit_items: { item_id: string; position: number }[];
};

function liveOutfits(client: NonNullable<typeof supabase>): Outfits {
  return {
    async load() {
      const { data, error } = await client
        .from('outfits')
        .select('id, name, outfit_items(item_id, position)')
        .order('created_at', { ascending: false })
        .returns<Row[]>();
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        name: row.name ?? '',
        itemIds: [...row.outfit_items]
          .sort((a, b) => a.position - b.position)
          .map((i) => i.item_id),
      }));
    },

    async save(draft) {
      const name = draft.name.trim() || null;
      let id = draft.id;
      if (id) {
        const { error } = await client.from('outfits').update({ name }).eq('id', id);
        if (error) throw error;
        const cleared = await client.from('outfit_items').delete().eq('outfit_id', id);
        if (cleared.error) throw cleared.error;
      } else {
        const { data, error } = await client.from('outfits').insert({ name }).select('id').single();
        if (error) throw error;
        id = data.id as string;
      }
      if (draft.itemIds.length > 0) {
        const { error } = await client
          .from('outfit_items')
          .insert(draft.itemIds.map((item_id, position) => ({ outfit_id: id, item_id, position })));
        if (error) throw error;
      }
      return { id, name: name ?? '', itemIds: draft.itemIds };
    },

    async remove(id) {
      const { error } = await client.from('outfits').delete().eq('id', id);
      if (error) throw error;
    },
  };
}

export const outfits: Outfits = supabase ? liveOutfits(supabase) : sampleOutfits();
