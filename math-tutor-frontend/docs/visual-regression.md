# Visual Regression Workflow

This project uses a matrix-first visual regression workflow.

## Matrix

Run:

```bash
npm run visual:matrix
```

This generates:

- `docs/visual-regression-matrix.json`

Matrix scope:

- 10 key screens
- 4 modes (`desktop/mobile` x `dark/light`)
- 40 total scenarios

## Capture screenshots

Capture current screenshots:

```bash
npm run visual:current
```

Capture / refresh baseline screenshots:

```bash
npm run visual:baseline
```

Capture script requirements:

1. `playwright` package available in environment
2. Browser runtime available (Chromium)
3. Build artifacts available for `vite preview` (run `npm run build` before CI gate if needed)

If `playwright` is missing:

1. non-strict mode: capture step is skipped
2. strict mode (`VISUAL_CAPTURE_STRICT=1`): command fails

## Baseline and current folders

Expected image paths are produced per scenario:

- baseline: `visual-baseline/<scenario>.png`
- current: `visual-current/<scenario>.png`

## Diff check

Run non-strict check:

```bash
npm run visual:diff
```

Run strict check (CI mode):

```bash
VISUAL_DIFF_STRICT=1 npm run visual:diff
```

Strict mode fails if:

1. baseline/current image pair is missing
2. image hash differs from baseline

## Ignore list for known volatile scenarios

Optional file:

- `docs/visual-regression-ignore.json`

Format:

```json
{
  "ignoreChanged": ["lesson-details__*"]
}
```

Rules:

1. exact scenario IDs are supported
2. prefix wildcard is supported via trailing `*`
3. ignored scenarios are reported but do not fail strict diff

## CI gate

Strict CI gate (matrix + capture + strict diff):

```bash
npm run visual:gate
```

This fails on:

1. capture failures in strict mode
2. missing baseline/current pairs
3. hash mismatches against baseline

## Notes

1. In restricted environments without browser runtime, matrix generation and static smoke still run.
2. Screenshot capture can be executed in developer machines or CI runners with browser support.
3. `verify` includes non-strict `visual:diff` as a reporting step; strict enforcement stays in `visual:gate`.
