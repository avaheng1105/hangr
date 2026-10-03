// Edge Function `jobs`: see handler.ts. Needs these secrets
// (`supabase secrets set ...`): HANGR_WORKER_URL (the Modal `jobs` endpoint),
// HANGR_WORKER_TOKEN (shared with the worker) and, optionally,
// HANGR_DAILY_JOB_LIMIT (default 30). SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { DailyLimitError, handle, type Deps } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const workerUrl = Deno.env.get('HANGR_WORKER_URL')!;
const workerToken = Deno.env.get('HANGR_WORKER_TOKEN')!;
const dailyLimit = Number(Deno.env.get('HANGR_DAILY_JOB_LIMIT') ?? '30');

// A client that acts as the caller, so row-level security applies.
const asCaller = (authorization: string) =>
  createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });

const deps: Deps = {
  async userId(authorization) {
    const token = authorization.replace(/^Bearer /, '');
    if (!token) return null;
    const { data } = await admin.auth.getUser(token);
    return data.user?.id ?? null;
  },
  async ownItem(authorization, itemId) {
    const { data } = await asCaller(authorization)
      .from('items')
      .select('id')
      .eq('id', itemId)
      .maybeSingle();
    return data;
  },
  async claim(itemId, type, fromStatus) {
    const { data, error } = await admin.rpc('claim_item', {
      p_item: itemId,
      p_type: type,
      from_status: fromStatus,
      daily_limit: dailyLimit,
    });
    if (error?.hint === 'daily_limit') throw new DailyLimitError(error.message);
    if (error) throw new Error(error.message);
    return data as number | null;
  },
  async release(itemId, status, message) {
    await admin.from('items').update({ status, error: message }).eq('id', itemId);
  },
  async sendToWorker(job) {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`worker answered ${response.status}`);
  },
};

Deno.serve((req) => handle(req, deps));
