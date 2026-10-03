# Hangr backend (Supabase)

```
app ── insert item, upload photo to {user}/{item}/upload ──► Supabase (Postgres + Storage)
    └─ POST functions/v1/jobs {item_id, type} ──► Edge Function `jobs`
                                                   checks ownership, claims the item,
                                                   enforces a daily job limit
                                                   └─► Modal `jobs` endpoint ─► GPU worker
                                                       runs the pipeline and writes assets,
                                                       item_assets rows and items.meta back
app ◄── polls items while any is processing
```

| Piece | Where |
|---|---|
| Tables, Storage bucket, access rules, `claim_item` | `migrations/` |
| Edge Function | `functions/jobs/` (`handler.ts` is the logic, `index.ts` wires Supabase) |
| Worker | `pipeline/modal_app.py` (`jobs` endpoint, `Pipeline.run_job`), `pipeline/hangr_pipeline/jobs.py` |
| App | `app/src/closet.ts` |

Sign-in is anonymous for now: each device gets a guest account. Users can
read only their own items and files, upload only the photo of an item they
created, and change only `review_resolution`. Everything else is written by
the worker with the service role key.

Each job is logged in `jobs`, so `select type, count(*) from jobs group by 1`
gives the Gemini call count (about 2 per regenerate, up to 4 per new photo).
Users are limited to `HANGR_DAILY_JOB_LIMIT` jobs a day (default 30).

## Deploy

The live project is `kucodzbbcumwtravnuft` (Tokyo). Its URL and anon key are
in `app/src/supabase.ts`; the anon key is public by design.

- **Database:** apply new files in `migrations/` with `supabase db push`, or,
  where Postgres connections are blocked (as in Claude's cloud environment),
  run each file through the Management API's `database/query` endpoint and
  add its version to `supabase_migrations.schema_migrations`.
- **Edge Function:** `supabase functions deploy jobs --project-ref <ref> --use-api`.
- **Worker:** the `Deploy worker` GitHub Action (`.github/workflows/deploy-worker.yml`)
  deploys `pipeline/modal_app.py` to Modal, then sets the function's
  `HANGR_WORKER_URL` and `HANGR_WORKER_TOKEN`. It needs the repository
  secrets listed in the workflow and runs on pipeline changes or by hand.
- **Guest sign-in** is turned on in the project (Authentication > Sign In /
  Providers > anonymous). Don't use `supabase config push`: it would also
  push `config.toml`'s local settings, such as `site_url`.

Anyone who has the app can create guest accounts (Supabase allows 30 per
hour per IP), and each account gets `HANGR_DAILY_JOB_LIMIT` jobs a day. Swap
guests for real sign-in before sharing the app widely.

## Test

```bash
cd supabase/tests && npm install && npm test          # access rules, in PGlite
deno test supabase/functions/jobs/                     # Edge Function logic
cd pipeline && pytest tests/test_jobs.py               # worker jobs
```

With Docker, `supabase start` runs the whole backend locally; run the worker
with `python -m hangr_pipeline.worker` and set `HANGR_WORKER_URL` to
`http://host.docker.internal:8787` in `supabase/functions/.env`.
