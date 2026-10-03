# Hangr image pipeline

Turns a clothing photo into a Starlook-style product shot: the item redrawn
as a catalogue image (clothes on an invisible mannequin), cut out on a
transparent background.

```
photo ─► enhance (image-edit model, optional)
      ─► fidelity check (Gemini vision judge) ── fail ─► retry with the judge's
         list of fixes ── still failing ─► best attempt flagged needs_review,
         or the original photo if nothing scored ≥ 5/10
      ─► background removal + framing (square, centred, 10% margin)
      ─► original.webp · enhanced.webp · cutout.png · thumb.webp · meta.json
```

| Output | What it is |
|---|---|
| `original.webp` | The uploaded photo, rotated upright and capped at 2048 px |
| `enhanced.webp` | The image-edit model's result (present when enhance ran, even if rejected) |
| `cutout.png` | 1024×1024 RGBA item on a transparent background — what the wardrobe and canvas show |
| `thumb.webp` | 256×256 cutout for closet grids |
| `meta.json` | Which steps ran, fidelity scores, prompt version, timings |

## Each step, and its no-ML fallback

| Step | GPU / API version | Fallback (runs anywhere) |
|---|---|---|
| Enhance | OpenAI (`gpt-image-2`) or Gemini (`gemini-3.1-flash-image`) image editing. The prompt depends on `--category` (top, outerwear, dress, bottom, skirt, shoes, bag, jewelry, accessory, or auto): clothes get the ghost-mannequin look, other items a catalogue product shot. The background colour is chosen to contrast with the item (dark grey for light items) so it cuts out cleanly (`prompts.py`, `enhance.py`) | `--enhance none` |
| Fidelity | Gemini vision judge (`gemini-flash-latest`) compares the photo and the product shot: colours, print, text, hardware and cut. Scores 1–10; 7+ passes, and its list of differences is fed into the retry (`fidelity.py`) | `HANGR_FIDELITY_METHOD=colour`: colour histograms (no API call, but needs a clean cutout of the original and can't see shape) |
| Cutout | BiRefNet via `rembg` | `--cutout colorkey`: flood-fills the plain background from the border, then unmixes garment and background colour along the edge. Works on the product shots (plain background); not on raw photos of clothes on a patterned floor |

Model names are set in `config.py` and can be overridden with
`HANGR_OPENAI_IMAGE_MODEL` / `HANGR_GEMINI_IMAGE_MODEL`. Check the providers'
current model lists and pricing before you pick one.

## Run locally (CPU, no ML)

```bash
cd pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

python scripts/make_sample_photo.py samples/tshirt.jpg      # synthetic test photo
python -m hangr_pipeline samples/tshirt.jpg -o out --cutout colorkey

# Add the image-edit step (needs OPENAI_API_KEY or GEMINI_API_KEY):
python -m hangr_pipeline photo.jpg -o out --enhance gemini --category top --cutout colorkey

pytest
```

To preview your own output in the app, copy `out/cutout.png` into
`app/assets/sample/`.

## Run on a GPU (Modal)

```bash
pip install modal && modal setup                       # one-time login
modal secret create hangr-ai-keys OPENAI_API_KEY=sk-... GEMINI_API_KEY=...

modal run modal_app.py --photo photo.jpg --enhance openai --category top   # results in ./out
modal deploy modal_app.py                                   # for the backend to call later
```

The first `modal run` builds the container image (CUDA, model weights) and takes several minutes. After that, a cold start loads the models
in seconds, and a warm worker removes the background in about a second; the
image-edit API call takes most of the time. Workers shut down after 2 minutes idle (`scaledown_window`).

> The ML path (BiRefNet on Modal) hasn't been run yet: the
> environment this was built in couldn't download model weights. The no-ML
> path and the provider integrations (with mocked SDK clients) are covered by
> the tests.
