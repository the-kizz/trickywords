# Contributing

This is a small, self-hosted project built for one family and shared in
case it's useful to others. PRs are welcome — bug fixes, a new game,
accessibility improvements, translations, whatever.

For anything more than a small fix, please open an issue first to talk
through the approach before you put the work in. That's mostly to save
you time: some choices here (no fail states, no drag interactions, the
76px touch-target floor, the errorless-first design) are deliberate and
documented in `docs/superpowers/specs/2026-09-16-trickywords-design.md`,
and a PR that reverses one of them without discussion is unlikely to be
merged as-is.

Before opening a PR:

```bash
npm test && npm run test:e2e
```

Both suites need to pass. The E2E suite in particular proves several of
the README's claims (no fail states, no cookies or external requests in
public mode, per-tab guest progress) — if your change touches guest mode,
the games, or the progress engine, check the relevant spec in `tests/e2e/`
still holds.
