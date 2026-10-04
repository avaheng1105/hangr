import { supabase } from './supabase';

// Which outfit goes with which day ('YYYY-MM-DD' -> outfit id).
export type OutfitDays = Record<string, string>;

export type Calendar = {
  load(): Promise<OutfitDays>;
  // Puts an outfit on a day, or clears the day (null).
  set(day: string, outfitId: string | null): Promise<void>;
};

// A local date as 'YYYY-MM-DD' (not toISOString, which is UTC).
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sampleCalendar(): Calendar {
  const days: OutfitDays = { [dayKey(new Date())]: 'sample' };
  return {
    load: async () => ({ ...days }),
    async set(day, outfitId) {
      if (outfitId) days[day] = outfitId;
      else delete days[day];
    },
  };
}

function liveCalendar(client: NonNullable<typeof supabase>): Calendar {
  return {
    async load() {
      const { data, error } = await client.from('outfit_days').select('day, outfit_id');
      if (error) throw error;
      return Object.fromEntries(data.map((row) => [row.day as string, row.outfit_id as string]));
    },

    async set(day, outfitId) {
      const { error } = outfitId
        ? await client.from('outfit_days').upsert({ day, outfit_id: outfitId })
        : await client.from('outfit_days').delete().eq('day', day);
      if (error) throw error;
    },
  };
}

export const calendar: Calendar = supabase ? liveCalendar(supabase) : sampleCalendar();
