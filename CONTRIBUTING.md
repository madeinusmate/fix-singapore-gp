# Contributing

Issues and pull requests are welcome. The live site is [fixsingaporegp.com](https://fixsingaporegp.com).

## Set up

```bash
pnpm install
pnpm dev
```

Node `^20.19.0` or `>=22.12.0`. The package manager is pnpm 8.15.9, pinned in `package.json`.

`pnpm test` checks the lap sim against the published Python figures and checks that the current lap can be rebuilt from its waypoints. `pnpm lint` runs oxlint.

Leave `.env` and `.firebaserc` on your machine. Both are gitignored. `.env.example` and `.firebaserc.example` are the templates.

## What to touch

- App, editor, lap sim, and drive mode live in `src/`.
- Product language is in [CONTEXT.md](CONTEXT.md). A closed lap is a layout. The homepage list is the leaderboard, headed "The grid" on the site.
- Decisions that should stay put are in [docs/adr](docs/adr).
- Third-party assets are listed in [CREDITS.md](CREDITS.md). If a change adds or replaces one, update that file, [NOTICE](NOTICE), and the credits shown on the drive page.

Street geometry under `public/data/` and `analysis/` is a derived OpenStreetMap database and stays under the Open Database License. Elevation in `public/data/dem.json` stays under CC BY 4.0. The MIT license covers the original code. Those data files keep the licences named in [NOTICE](NOTICE).

## Pull requests

Open a pull request against `main`. Describe what changed and how you checked it. `pnpm test` and `pnpm lint` run on every pull request.
