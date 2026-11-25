# Token Radar — Build the best token launch radar

Entry for the make.fun bounty
[Build the best token launch radar](https://make.fun/bounty/token-radar-01)
($1,325 USDC, 10 paid places, ends Mon 14 Dec 2026 17:00 WIB).

## What it does

Reads the sealed DefiLlama snapshot (`/input/snapshot.json`, 758 protocols
as of 2026-11-14), ranks every protocol that records no token by an
implied value, and renders a dashboard a reader can use: a sortable,
filterable board, a detail view for each protocol with its model
breakdown, and a 7-step farm plan with costs and times.

## Model — radar-2

One function scores every protocol; no name is special-cased:

```
implied = round( tvl_usd x 0.22
  x (1 + clamp(change_7d, -50, 100) / 100 x 1.0)
  x (0.55 + min(age_days, 1460) / 1460 x 0.65)
  x (0.95 + min(chains, 8) x 0.02) )
```

TVL is the size of the business a token would price, seven-day growth
is its momentum (full weight, so a fast-growing protocol can outrank a
larger flat one), age with no token is how long the launch has been
pent up, and chain breadth is how widely the protocol is already
distributed. Live-token protocols are set aside with their market caps
shown, never mixed into the ranking.

## Board

226 rows: all 40 watchlist protocols, plus every rankable pre-token
protocol below the $50M floor (186 early rows). Each row carries a
7-step farm plan derived from its category, chains, TVL and age.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22.18+ required, standard library only. The program runs twice
and both runs write byte-identical files.

## Layout

- `main.ts` — entrypoint: reads the snapshot, writes `board.json`,
  `data.js`, copies `dashboard/` and `screenshots/`, writes `dossier.json`
- `lib/radar.ts` — the radar-2 model, farm plans, snapshot parsing
- `dashboard/` — static page (`index.html`, `radar.css`, `radar.js`),
  renders with no network
- `screenshots/` — board, detail view, filtered view (1440x900)
- `vendor/makefun-board.ts` — make.fun dossier library, vendored from the kit

## License

MIT — see `LICENSE`.
