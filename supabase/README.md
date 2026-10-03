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

Needs a Supabase project and a Modal account. `SUPABASE_ACCESS_TOKEN`,
`MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` in the environment.

```bash
REF=<project ref>
TOKEN=$(openssl rand -hex 32)          # shared by the Edge Function and the worker

# 1. Database, Storage and the Edge Function
supabase link --project-ref $REF
supabase db push
supabase functions deploy jobs

# 2. Allow anonymous sign-ins (Dashboard: Authentication > Sign In / Providers).
#    Don't use `supabase config push`: it would also push config.toml's local
#    settings, such as site_url.
curl -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"external_anonymous_users_enabled": true}'

# 3. Worker (from pipeline/). `modal deploy` prints the jobs endpoint URL.
supabase projects api-keys --project-ref $REF          # service_role key for the worker
modal secret create hangr-ai-keys GEMINI_API_KEY=...
modal secret create hangr-backend SUPABASE_URL=https://$REF.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=... HANGR_WORKER_TOKEN=$TOKEN
modal deploy modal_app.py

# 4. Point the Edge Function at the worker
supabase secrets set HANGR_WORKER_URL=<jobs endpoint URL> HANGR_WORKER_TOKEN=$TOKEN

# 5. App: app/.env.local (see app/.env.example) with the project URL and anon key
```

## Test

```bash
cd supabase/tests && npm install && npm test          # access rules, in PGlite
deno test supabase/functions/jobs/                     # Edge Function logic
cd pipeline && pytest tests/test_jobs.py               # worker jobs
```

With Docker, `supabase start` runs the whole backend locally; run the worker
with `python -m hangr_pipeline.worker` and set `HANGR_WORKER_URL` to
`http://host.docker.internal:8787` in `supabase/functions/.env`.
