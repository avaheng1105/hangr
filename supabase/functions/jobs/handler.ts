// Starts a pipeline run for one of the caller's items:
//   POST { "item_id": "...", "type": "process" }                     after uploading a photo
//   POST { "item_id": "...", "type": "regenerate", "note": "..." }   from the review screen
// It checks the caller owns the item, claims it (status -> processing, so a
// double tap can't start two runs) and hands the job to the GPU worker,
// which writes the result back to the database.

export type JobType = 'process' | 'regenerate';
export type Job = { item_id: string; type: JobType; note?: string };

export type Deps = {
  // The caller's user id from their JWT, or null.
  userId(authorization: string): Promise<string | null>;
  // The item if it belongs to the user, else null.
  ownItem(authorization: string, itemId: string): Promise<{ id: string } | null>;
  // public.claim_item: the new generation, or null if the item isn't in
  // one of `fromStatus`. Throws DailyLimitError over the limit.
  claim(itemId: string, type: JobType, fromStatus: string[]): Promise<number | null>;
  // Puts the item back after the worker couldn't be reached.
  release(itemId: string, status: string, error: string): Promise<void>;
  // POSTs the job to the worker; throws if it isn't accepted.
  sendToWorker(job: Job): Promise<void>;
};

export class DailyLimitError extends Error {}

// Same as pipeline.NOTE_MAX_CHARS; the pipeline trims it again anyway.
export const NOTE_MAX_CHARS = 200;

// Which item states each job can start from.
const FROM_STATUS: Record<JobType, string[]> = {
  process: ['uploading', 'failed'],
  regenerate: ['ready'],
};
// Where a job leaves the item if the worker can't be reached.
const RELEASE_STATUS: Record<JobType, string> = { process: 'failed', regenerate: 'ready' };

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function parseJob(body: unknown): Job | null {
  if (typeof body !== 'object' || body === null) return null;
  const { item_id, type, note } = body as Record<string, unknown>;
  if (typeof item_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(item_id)) return null;
  if (type !== 'process' && type !== 'regenerate') return null;
  if (note !== undefined && note !== null && typeof note !== 'string') return null;
  const job: Job = { item_id, type };
  const trimmed = typeof note === 'string' ? note.split(/\s+/).join(' ').trim() : '';
  if (type === 'regenerate' && trimmed) job.note = trimmed.slice(0, NOTE_MAX_CHARS);
  return job;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const authorization = req.headers.get('Authorization') ?? '';
  if (!(await deps.userId(authorization))) return json(401, { error: 'sign in first' });

  let job: Job | null = null;
  try {
    job = parseJob(await req.json());
  } catch {
    // fall through: not JSON
  }
  if (!job) return json(400, { error: 'expected { item_id, type, note? }' });
  if (!(await deps.ownItem(authorization, job.item_id))) {
    return json(404, { error: 'no such item' });
  }

  let generation: number | null;
  try {
    generation = await deps.claim(job.item_id, job.type, FROM_STATUS[job.type]);
  } catch (e) {
    if (e instanceof DailyLimitError) {
      return json(429, { error: "You've reached today's limit for new and regenerated images." });
    }
    throw e;
  }
  if (generation === null) {
    return json(409, { error: 'This item is already being processed.' });
  }

  try {
    await deps.sendToWorker(job);
  } catch (e) {
    console.error('worker unreachable', e);
    await deps.release(job.item_id, RELEASE_STATUS[job.type], 'The image service is unavailable.');
    return json(502, { error: 'The image service is unavailable. Try again later.' });
  }
  return json(202, { item_id: job.item_id, status: 'processing', generation });
}
