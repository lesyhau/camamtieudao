# Cảm Âm Tiêu Dao

Reads a jianpu (简谱) sheet from an image and converts it to Vietnamese cảm âm.

A chat interface with an attach button, Google sign-in, and nothing else. Developer notes;
the customer-facing install manual is [deploy/INSTALL.md](deploy/INSTALL.md).

## Status

| | |
|---|---|
| Conversion core (`src/lib/camam/`) | done - 16 tests, ground truth converts end to end |
| Extraction from an image | not started |
| Chat UI + Google sign-in | not started |
| Deploy package + CI/CD | done - not yet pointed at a host |

## Quick start

```bash
npm ci
npm test          # unit + acceptance, no image and no model needed
npm run dev
```

Node 22.18 or newer.

## How it works

```
image ──vision model──> JPX ──parse──> RawScore ──build──> CamAmDoc (JSON) ──> render
                         ▲
        fixtures/*.jpwabc ┘   ground truth takes the same path from `parseJpwabc`
```

**JPX** is jianpu note syntax with lyrics inlined per note - `1_ 7,__[个|们]` - so a syllable
can never drift out of alignment with its note, which is the failure mode of asking a model
for a large structured document. `CamAmDoc` is the JSON every renderer consumes; it carries
both anchor mappings, exact note lengths, per-verse lyrics and the page structure.

The pitch model is four ordered stages and the conversion is two-pass - a note's name depends
on the lowest note in the whole song. See [CLAUDE.md](CLAUDE.md) before changing anything under
`src/lib/camam/`.

## Layout

```
src/lib/camam/     conversion core - framework-free, no Next imports
  types.ts         CamAmDoc schema
  camam.ts         anchors, strict accidentals, normalization, case, lengths
  jpwabc.ts        .jpwabc importer (note grammar shared with JPX)
  build.ts         RawScore -> CamAmDoc
src/app/           Next App Router
fixtures/          ground truth transcriptions
deploy/            the install package - Dockerfile, compose, install.sh
```

## Branching

`dev` for integration, `main` for production. Always branch from `dev`. Merging a
`dev` → `main` PR is what deploys. Full detail in [CLAUDE.md](CLAUDE.md).
