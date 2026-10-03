import { assertEquals } from 'jsr:@std/assert@1';

import { DailyLimitError, handle, parseJob, type Deps, type Job } from './handler.ts';

const ITEM = '0b7f4a39-55c8-4d39-9a1f-4e4b8f0f6a01';

function fakeDeps(over: Partial<Deps> = {}) {
  const sent: Job[] = [];
  const released: string[] = [];
  const deps: Deps = {
    userId: async (auth) => (auth === 'Bearer good' ? 'user-1' : null),
    ownItem: async (_auth, id) => (id === ITEM ? { id } : null),
    claim: async () => 3,
    release: async (_id, status) => {
      released.push(status);
    },
    sendToWorker: async (job) => {
      sent.push(job);
    },
    ...over,
  };
  return { deps, sent, released };
}

function post(body: unknown, auth = 'Bearer good') {
  return new Request('http://fn/jobs', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test('regenerate is claimed and sent to the worker with a cleaned note', async () => {
  const { deps, sent } = fakeDeps();
  const res = await handle(post({ item_id: ITEM, type: 'regenerate', note: '  plain\n sleeves ' }), deps);
  assertEquals(res.status, 202);
  assertEquals(sent, [{ item_id: ITEM, type: 'regenerate', note: 'plain sleeves' }]);
});

Deno.test('signed-out callers are refused', async () => {
  const { deps, sent } = fakeDeps();
  const res = await handle(post({ item_id: ITEM, type: 'process' }, 'Bearer bad'), deps);
  assertEquals(res.status, 401);
  assertEquals(sent.length, 0);
});

Deno.test("another user's item is not found", async () => {
  const { deps } = fakeDeps({ ownItem: async () => null });
  assertEquals((await handle(post({ item_id: ITEM, type: 'process' }), deps)).status, 404);
});

Deno.test('an item already processing is refused', async () => {
  const { deps, sent } = fakeDeps({ claim: async () => null });
  assertEquals((await handle(post({ item_id: ITEM, type: 'regenerate' }), deps)).status, 409);
  assertEquals(sent.length, 0);
});

Deno.test('the daily limit returns 429', async () => {
  const { deps } = fakeDeps({
    claim: () => Promise.reject(new DailyLimitError('daily limit reached')),
  });
  assertEquals((await handle(post({ item_id: ITEM, type: 'regenerate' }), deps)).status, 429);
});

Deno.test('a worker outage releases the item', async () => {
  const { deps, released } = fakeDeps({
    sendToWorker: () => Promise.reject(new Error('down')),
  });
  assertEquals((await handle(post({ item_id: ITEM, type: 'regenerate' }), deps)).status, 502);
  assertEquals(released, ['ready']);
});

Deno.test('bad bodies are rejected', () => {
  assertEquals(parseJob({ item_id: 'x', type: 'process' }), null);
  assertEquals(parseJob({ item_id: ITEM, type: 'delete' }), null);
  assertEquals(parseJob({ item_id: ITEM, type: 'regenerate', note: 5 }), null);
  assertEquals(parseJob({ item_id: ITEM, type: 'process', note: 'ignored' }), {
    item_id: ITEM,
    type: 'process',
  });
  assertEquals(parseJob({ item_id: ITEM, type: 'regenerate', note: 'x'.repeat(500) })?.note?.length, 200);
});
