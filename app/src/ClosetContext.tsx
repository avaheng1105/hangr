import * as ImagePicker from 'expo-image-picker';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { calendar, type OutfitDays } from './calendar';
import { closet, type ItemChanges } from './closet';
import type { Item, ReviewResolution } from './items';
import { outfits as outfitStore, type Outfit, type OutfitDraft, type Placement } from './outfits';

// How often to check on items the pipeline is still working on.
const POLL_MS = 4000;

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

type ClosetState = {
  items: Item[];
  // The last thing that went wrong, shown at the top of the wardrobe.
  message: string | null;
  adding: boolean;
  live: boolean;
  addPhoto(): Promise<void>;
  remove(item: Item): Promise<void>;
  review(item: Item, resolution: ReviewResolution): Promise<void>;
  regenerate(item: Item, note: string): Promise<void>;
  update(item: Item, changes: ItemChanges): Promise<void>;
  outfits: Outfit[];
  saveOutfit(draft: OutfitDraft): Promise<Outfit>;
  removeOutfit(id: string): Promise<void>;
  saveLayout(id: string, layout: Record<string, Placement>): Promise<void>;
  days: OutfitDays;
  setDay(day: string, outfitId: string | null): Promise<void>;
};

const ClosetContext = createContext<ClosetState | null>(null);

// The user's items and outfits, shared by every screen.
export function ClosetProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [days, setDays] = useState<OutfitDays>({});

  const refresh = useCallback(async () => {
    try {
      setItems(await closet.load());
    } catch (e) {
      setMessage(`Couldn't load your closet: ${errorMessage(e)}`);
    }
  }, []);

  useEffect(() => {
    // Items first: loading them signs the user in.
    closet
      .load()
      .then((loaded) => {
        setItems(loaded);
        return outfitStore.load();
      })
      .then((loaded) => {
        setOutfits(loaded);
        return calendar.load();
      })
      .then(setDays)
      .catch((e) => setMessage(`Couldn't load your closet: ${errorMessage(e)}`));
  }, []);

  const working = items.some((item) => item.status === 'uploading' || item.status === 'processing');
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [working, refresh]);

  const state = useMemo<ClosetState>(() => {
    const replace = (next: Item) =>
      setItems((current) => current.map((item) => (item.id === next.id ? next : item)));

    return {
      items,
      message,
      adding,
      live: closet.live,

      async addPhoto() {
        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          base64: true,
          // iPhone photos are HEIC by default; ask for JPEG, which the pipeline reads.
          preferredAssetRepresentationMode:
            ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        });
        if (picked.canceled) return;
        setAdding(true);
        setMessage(null);
        try {
          await closet.add(picked.assets[0]);
          await refresh();
        } catch (e) {
          setMessage(`Couldn't add that photo: ${errorMessage(e)}`);
        } finally {
          setAdding(false);
        }
      },

      // Throws, so the screen that asked can say what went wrong.
      async remove(item) {
        await closet.remove(item);
        setItems((current) => current.filter((i) => i.id !== item.id));
        // The database takes it out of every outfit too.
        setOutfits((current) =>
          current.map((o) => ({ ...o, itemIds: o.itemIds.filter((id) => id !== item.id) })),
        );
      },

      async review(item, resolution) {
        replace(await closet.review(item, resolution));
      },

      async regenerate(item, note) {
        replace(await closet.regenerate(item, note));
      },

      async update(item, changes) {
        replace(await closet.update(item, changes));
      },

      outfits,

      async saveOutfit(draft) {
        const saved = await outfitStore.save(draft);
        setOutfits((current) => [saved, ...current.filter((o) => o.id !== saved.id)]);
        return saved;
      },

      async removeOutfit(id) {
        await outfitStore.remove(id);
        setOutfits((current) => current.filter((o) => o.id !== id));
        // The database clears its days too.
        setDays((current) =>
          Object.fromEntries(Object.entries(current).filter(([, outfitId]) => outfitId !== id)),
        );
      },

      async saveLayout(id, layout) {
        await outfitStore.saveLayout(id, layout);
        setOutfits((current) => current.map((o) => (o.id === id ? { ...o, layout } : o)));
      },

      days,

      async setDay(day, outfitId) {
        await calendar.set(day, outfitId);
        setDays((current) => {
          const next = { ...current };
          if (outfitId) next[day] = outfitId;
          else delete next[day];
          return next;
        });
      },
    };
  }, [items, message, adding, outfits, days, refresh]);

  return <ClosetContext.Provider value={state}>{children}</ClosetContext.Provider>;
}

export function useCloset(): ClosetState {
  const state = useContext(ClosetContext);
  if (!state) throw new Error('useCloset must be used inside ClosetProvider');
  return state;
}
