# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**Cảm Âm Tiêu Dao** reads a jianpu (简谱, Chinese numbered notation) sheet from an image and
converts it to Vietnamese cảm âm. One thing, done well: a chat interface with an attach
button, Google sign-in, and nothing else. No settings page - the model is configured entirely
by environment variables.

Deliberately **not** in scope: history, folders, sharing, document search, multiple providers,
a settings UI. Every one of those is a reason this stops being simple.

Related work, not dependencies:
- `../../jianpu_workspace/jpeditor` - a jianpu editor with a local OMR pipeline (`src/omr/`).
  Its `RecognizedScore` is the same shape of data this repo's extractor produces, and its
  `.jpwabc` writer is where the fixture came from. That pipeline is browser-welded
  (`OffscreenCanvas`, `onnxruntime-web`) and cannot produce repeats, voltas, tuplets or
  accidentals - which is why extraction here is a vision model, not a port of it.
- `../../proxyma_workspace` - the deployment conventions below are copied from it verbatim.

## The pitch model - read this before touching `src/lib/camam/`

Four ordered stages. **Stages 3-4 need the whole song, so conversion is two-pass by
construction.** A per-note pure function cannot produce a cảm âm name.

1. **Absolute position.** `p = 7 × octave + (digit − 1)`, octave ∈ [−2, +2], so `1,,`…`7''`.
   This is all the extractor produces. `p` is stored in the output so a renderer can derive a
   third anchor without re-extracting.

2. **Anchor.** `q = p − (s − 1)` where `s` is the degree called `do`; `ring = q mod 7`,
   `band = ⌊q / 7⌋`. Two anchors ship, both in `ANCHORS`:

   | jianpu | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
   |---|---|---|---|---|---|---|---|
   | `5 → do` (mixolydian) | fa | sol | la | **sib** | do | re | mi |
   | `2 → do` (dorian) | **sib** | do | re | **mib** | fa | sol | la |

   The flats are not optional and not a bug. Relabelling a major scale from a non-tonic degree
   produces a mode; anchoring at 5 means the flute is a fourth away and its leading tone is a
   semitone high. Accidental mode is **always strict**.

   A **printed** accidental from the sheet *adds* to the modal alteration rather than replacing
   it, so `#4` under `5 → do` correctly cancels `sib` back to a natural `si`. Overriding
   instead would emit `si#`. There is a test for exactly this.

3. **Normalize.** Shift every band by `−min(band)` over non-rest notes, computed
   **independently per anchor**. This is what guarantees no `do,` / `do,,` ever reaches the
   output - the low octave is expressed by moving the whole song, not by a suffix.

4. **Case.** band 0 lowercase, 1 Capitalized, 2 UPPERCASE, ≥3 UPPERCASE + `'` and a warning.
   The case transform applies to the whole token including the accidental: `sib`/`Sib`/`SIB`.

**Consequence for the UI:** a low note near the end changes the case of every note before it,
so cảm âm cannot be streamed. Extract fully, then render once.

Note lengths: `length = (1/2^u) × (1 + Σ 2^−k for k=1..d) + n`, with `u` underscores, `d` dots,
`n` dashes, in units of `x` = the un-underlined note = one quarter. Emitted as an exact
reduced fraction *and* a float; do not drop the fraction.

## Ground truth

`fixtures/tan-van-xi.jpwabc` is 叹云兮 (JP-Word4, 桃李醉春风 记谱) - 419 notes, 51 measures,
12 lines, 2 verses. `npm test` converts it end to end with **no image and no model involved**,
so a failure there is always the converter, never the extractor. Keep that property.

Two things known about this fixture:

- **`5 → do` needs 4 bands on this song; `2 → do` needs 3.** Not a defect in either - the song
  covers ~2.6 octaves and anchoring at 5 straddles four band boundaries where anchoring at 2
  straddles three. Restricting to sung notes does not change it. Band occupancy:
  `5→do` = 7/280/105/4, `2→do` = 164/217/15.
- **The ground truth has no accidentals.** The sheet prints `2#11` and `1#55`; the `.jpwabc`
  contains zero `#` tokens. When scoring extractor output against it, a correctly-read `#`
  registers as a false positive. Patch the fixture or exclude accidentals from the metric -
  do not discover this while debugging a score.

`.Words` is **character-addressed, not slash-delimited**: each CJK character consumes one note,
`/` consumes a note with no lyric (melisma), trailing punctuation glues onto the previous
syllable without consuming a note, and a trailing `“` migrates to the next. Splitting on `/`
looks plausible and silently mis-aligns every verse. Mirrors `WordsSection.parse` in
jpeditor's `src/jpword/jpwfile.ts`.

## Commands

```bash
npm run dev          # Next dev server
npm run build        # production build -> .next/standalone
npm run typecheck    # tsc --noEmit
npm test             # node --test, the M1 unit + acceptance suites

node scripts/logo-assets.ts   # logo.png -> public/logo*.png + src/app/{icon,apple-icon}.png
```

On Windows `npm run build` **hangs** if a standalone server from an earlier test is still
running: it holds locks on `.next`. Stop it first.

Node **22.18+**. `src/lib/camam/` is plain `.ts` run through Node's own type stripping - no
bundler, no ts-node - so relative imports there carry explicit `.ts` extensions and the code
must stay erasable (`erasableSyntaxOnly` is on). No enums, no parameter properties.

## Branching and deployment

Identical to the Proxyma workspace, and for the same reasons.

```
main   production - only ever updated by merging dev
dev    integration - branch from here
```

Always branch from `dev`, never from `main`. Prefix branches `feature/` `bugfix/` `hotfix/`
`release/` `chore/` `docs/`. Merge to `dev` by PR; promote by a `dev` → `main` PR. Merging
that PR is what deploys - there is no other path.

| Environment | Branch | GitHub environment | Host | Stack dir | Port |
|---|---|---|---|---|---|
| Production | `main` | `production` | `vm-camamtieudao` (GCP), Debian 13 | `/opt/camamtieudao` | 4249 |
| Development | `dev` | `development` | **not provisioned** | `/opt/camamtieudao` | 4249 |

`deploy.yml` **skips cleanly** when its environment has no `VM_HOST`, which is what `dev` does
today. Proxyma deleted its dev deploy jobs outright for the opposite reason - they targeted a
host that had never been provisioned, so every dev push failed on a step that could not
succeed. Skipping keeps the wiring for the day a dev host appears. Do not point `dev` at the
production VM to "make it work": one environment per host is the rule, and two stacks of the
same service on one box collide on the stack directory, the loopback port *and* the compose
project name - the third of which fails silently.

The host is bootstrapped once by `deploy/host-setup.sh` (Docker, nginx, certbot, the stack
directory). It is idempotent and is not part of a deploy. TLS is issued by hand, once DNS
points at the machine - see the command that script prints.

**No workflow knows a hostname.** `deploy.yml` picks its environment with
`github.ref_name == 'main' && 'production' || 'development'`, and the environment supplies
`VM_USER` / `VM_HOST` / `VM_SSH_KEY`. Repointing an environment at a different machine is a
settings change, not a commit. Concurrency groups are per-ref.

Port 4249 continues the workspace allocation (4245 landing, 4246 demo, 4247 license,
4248 telemetry). The app serves its UI and API on that one port, published on loopback; the
host's nginx owns `:443` and forwards to it. The bundled `tls` Caddy profile is for a customer
with no reverse proxy of their own - vm0/vm1 do not use it.

`deploy/` IS the install package. Every deploy runs the same `install.sh` a customer runs, so
the install path is exercised on every merge.

## The free path - `src/lib/omr/`

Vendored from jpeditor's OMR, which is **browser code**. Everything Node-specific lives in
`canvas.ts`, so the vendored files differ from jpeditor's by an import line and stay re-syncable.
Put Node-vs-browser fixes in the shim, not in the vendored files.

One of those fixes is load-bearing. `drawImage(bigCanvas, sx,sy,sw,sh, ...)` under
`@napi-rs/canvas` leaks a full-size copy of the **source** on every call, and GC never gets it
back. Cropping ~690 digit cells and ~130 lyric strips out of a 2200x3112 page canvas is ~19GB of
snapshots, so the process died against whatever ceiling it had - 3.6GB on the 3.9GB VM, 7.87GB on
the 7.9GB one, exactly 3GB under a 3GB cgroup cap. It read like an allocator sizing itself to the
machine, which sent four investigations (ORT arena, input-shape count, input resolution, GC
pressure) after the wrong thing. `canvas.ts` patches the context prototype to crop via
`getImageData` first: peak went 7.87GB -> **623MB**, and that path is also 20x faster.

The lesson worth keeping: every wrong hypothesis was tested with Windows RSS, which reports the
**working set** and read 10-18GB for work the VM does in 623MB. Measure this on the target host.

```bash
node scripts/bench-free.ts      # accuracy vs ground truth + peak RSS. Run after ANY omr/ change.
node scripts/bench-jpeditor.ts  # OUR RecognizedScore vs jpeditor's CURRENT one. The real metric.
node scripts/bench-omr.ts       # legacy: vs test/output_N.txt, which is an OLD jpeditor build
node scripts/dump-jpeditor.ts   # capture what jpeditor's own build reads (drives the two above)
node scripts/mem-profile.ts     # per-phase memory timeline, live-printed so an OOM kill keeps it
```

Baseline on the reference sheet: 100% pitch, 100% octave, 98.1% rhythm, 100% cảm âm, ~7s.

### Agreement with jpeditor

**Measure against `test/jpeditor/input_N.json`, not `test/output_N.txt`.** The `.txt` files are
`.jpwabc` from an OLDER jpeditor build which its own current build no longer reproduces - it
scores 90.1% on input_2 and 80.5% on input_3 against them, and on input_2 its first error is the
same `3' 2' 1'` -> `1' 1' 1'` we make. Scoring against them charges us for jpeditor's changes as
if they were our defects, which is exactly what happened: it invented an "open lead" about the
recogniser returning nothing for `3`, and sent four investigations after it.

`test/jpeditor/input_N.json` is the `RecognizedScore` jpeditor's current build produces, captured
by `scripts/dump-jpeditor.ts` (Playwright over jpeditor's `dist/`; its playwright and build are
resolved from `JPEDITOR_DIR`, nothing is installed here). Both sides are `RecognizedScore`, so
`bench-jpeditor.ts` compares the recogniser with nothing downstream in the way.

| image | size | notes ref/ours | digits | +octave | +rhythm | key |
|---|---|---|---|---|---|---|
| input_0.png | 2480x3508 | 419/419 | **100%** | **100%** | **100%** | = |
| input_1.jpg | 709x1039 | 278/278 | **100%** | **100%** | **100%** | = |
| input_2.gif | 634x604 | 151/151 | **100%** | **100%** | **100%** | = |
| input_3.jpg | 382x523 | 87/58 | rows 3 vs 4 | - | - | = |
| input_4.jpg | 800x1241 | 170/170 | **100%** | **100%** | **100%** | = |
| input_5.jpg | 888x1243 | 280/280 | **100%** | **100%** | **100%** | = |

Five of six are now bit-for-bit what jpeditor reads. Two things had to be true for that, and both
were **wrongly excluded** by the notes this section replaces:

- **The canvas crop patch WAS the cause**, not a 2-note curiosity. Cropping via `getImageData`
  makes the resampling kernel clamp at the region edge, where `drawImage` with a source rect lets
  it reach into the neighbouring pixels. On a 9x9 digit blown up to 48px that changes the
  reading - it was mangling **every** cell (0 of 87 matched jpeditor's on input_3), and on input_4
  it silently dropped a whole staff row. Fixed in `canvas.ts` by copying a 2px margin of real
  neighbours and drawing the sub-rect out of that: peak RSS 417MB vs 385MB before and 18.2GB with
  the patch off, and the readings now match. **Do not "simplify" that margin away.**
- **`STRIP_BUCKET` was what lost input_4's flat**, not header parsing. Padding lyric/header strips
  out to a multiple of 128 fed the CTC enough extra zeros to swallow the `b` in `1=bE`. Default is
  now 1 (= jpeditor). Bucketing had already been measured as worth nothing.

Hypotheses tested and REJECTED, so nobody re-runs them:

- **Different ink.** The binary maps are byte-identical (IoU 100%) on inputs 1-5. input_0 is
  99.9% - 367px of 469k - and it is the only image exceeding `MAX_W`, so that is downscale
  resampling; all 419 digits still read identically. The two pipelines see the same ink.
- **Transparency.** `toGray` ignores alpha, and the PDF path fills white for that reason, but no
  test image has a single transparent or partial-alpha pixel.
- **Vendored files drifting.** They have not. `diff` reports ~1200 changed lines in `jianpu.ts`
  only because of CRLF; with `--strip-trailing-cr` it is 14 lines, all import paths. jpeditor's
  `9f63b03` (narrow-block `3/5`->`1`) and `4e4a490` are already in our copy.
- **`prepCell`'s `padTo`.** Dead code - never passed by either call site. Digit tensors were
  always 320 wide, same as jpeditor.
- **Resampling quality.** `low`, `medium` and the default are byte-identical under
  @napi-rs/canvas; `high` is worse; `off` is far worse. `OMR_SMOOTHING` in `canvas.ts` sweeps it.
- **Resolution.** `scripts/try-upscale.ts` enlarges before recognition. It makes input_2 WORSE
  (88.7% -> 84.8% at 2x) and moves input_3 around without fixing it.

**The one real gap is input_3**, a 382px scan whose glyphs are 4-8px tall. We find 3 staff rows
where jpeditor finds 4, because `jianpu.ts` drops any row where >=50% of digits read `0`, an empty
read counts as `0`, and that filter runs BEFORE the `rankDigits` pass that exists to repair
exactly those cells. Two fixes were tried and REVERTED - keeping rows by barline count, and
counting only hollow-ring `0`s as rests - because both resurrect the lyric rows that filter is
there to kill (10-12 rows, 231-265 notes). The root cause is upstream: our 48x48 tensors differ
from jpeditor's by ~0.15/255 almost everywhere (the 64->48 downscale inside `recognizeDigitCells`
resamples differently), which is nothing on a clean sheet and decisive on a 6px blob. Note that
jpeditor is also wrong here - 87 notes for a 151-note song, mostly `1`s - so matching it is worth
little. Bit-matching Blink's resampler is the only real fix and has poor cost/benefit.

## Brand

The UI is Proxyma's design system, copied as source (tokens in `globals.css`, `tailwind.config.ts`,
`Button.tsx`, `ThemeToggle`, `SiteBackground`) rather than transcribed. Three deliberate departures:

- **The type is Arial**, everywhere including the wordmark. No webfont is loaded, so there is no
  swap. Proxyma's Orbitron could not have been kept regardless: Google publishes it with the
  `latin` subset only, so every diacritic in "Cảm âm Tiêu Dao" would drop to a fallback face and
  the wordmark would render in two typefaces.
- **The mark is the brush photograph, not a trace of it.** `logo.png` (the artwork, at repo root)
  is the source; `scripts/logo-assets.ts` derives alpha from luminance, trims to the ink, and
  emits one PNG per mode plus the icons. It is not a vector: the dry-brush edge and the speckle
  are the artwork, and a filled path only approximates them. Ink colour is baked per file
  because ink-primary is a different hue in each mode, not an inversion.
- **`public/qr-ung-ho.png` is not in the repo yet.** It is the VietQR/napas payment code shown
  by the support card. It is deliberately NOT generated in code: a wrong CRC or account field in
  a payment code sends someone's money nowhere, so it has to be the real exported image. Until
  it exists the card degrades to the account details in text, which is correct behaviour, not a
  placeholder to replace with a fabricated QR.

## Conventions

- Strict TypeScript, `noUnusedLocals` / `noUnusedParameters`.
- The app holds **no state on disk**. No database. If history is ever added, that is when a
  `postgres` profile belongs in `deploy/docker-compose.yml` - not before.
- `.env` is never in a deploy payload; the host's configuration survives every deploy.
- Commit messages follow Conventional Commits, as in the Proxyma repos: `feat:` `fix:`
  `chore:` `docs:`. English, lower case after the prefix, no `Co-Authored-By` trailer.
