// Token Radar, model radar-2.
//
// One sealed snapshot in, one ranked board out. The board ranks protocols
// that record no token, by an implied value computed only from the
// snapshot's own figures. Nothing here names a protocol: the same
// arithmetic scores every row, and the farm plan for a row is derived
// from that row's category, chains, TVL and age.
//
// Model radar-2 (stated in full on the dashboard):
//   base      = tvl_usd * 0.22
//   growth    = clamp(change_7d, -50, 100) in percent; missing growth = 0
//   growthMul = 1 + growth / 100 * 1.0
//   age       = days from listed_at to the snapshot date; missing = 365
//   matureMul = 0.55 + min(age, 1460) / 1460 * 0.65
//   breadth   = 0.95 + min(chains, 8) * 0.02
//   implied   = round(base * growthMul * matureMul * breadth), at least 1
//
// Why these four inputs: TVL is the size of the business a token would
// price; seven-day growth is its momentum; age with no token is how long
// the launch has been pent up; chain breadth is how widely the protocol
// is already distributed. Growth carries full weight (1.0, not 0.5) so a
// fast-growing protocol can outrank a larger flat one, and maturity runs
// over four years so a protocol that has run two years with no token
// scores clearly above one listed last month.

export interface SnapProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapProtocol[];
  watchlist: string[];
}

export interface ModelParams {
  baseMultiple: number;
  growthWeight: number;
  growthLow: number;
  growthHigh: number;
  maturityLow: number;
  maturitySpan: number;
  maturityDays: number;
  unknownAge: number;
  breadthBase: number;
  breadthPerChain: number;
  breadthMaxChains: number;
}

export const MODEL: ModelParams = {
  baseMultiple: 0.22,
  growthWeight: 1.0,
  growthLow: -50,
  growthHigh: 100,
  maturityLow: 0.55,
  maturitySpan: 0.65,
  maturityDays: 1460,
  unknownAge: 365,
  breadthBase: 0.95,
  breadthPerChain: 0.02,
  breadthMaxChains: 8,
};

export const MODEL_VERSION = 'radar-2';

/** Every rankable pre-token protocol below the floor is carried, not a cap. */
export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  watchlist: boolean;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelParams;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from listedAt to asOf, never negative; null when unlisted or unparsable. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export interface Scored {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
}

/** Score one protocol under radar-2. No name is ever consulted. */
export function scoreProtocol(p: SnapProtocol, asOf: string, m: ModelParams = MODEL): Scored {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(m.growthHigh, Math.max(m.growthLow, numOr(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * m.growthWeight;
  const ageUsed = age ?? m.unknownAge;
  const maturityMult = m.maturityLow + (Math.min(Math.max(ageUsed, 0), m.maturityDays) / m.maturityDays) * m.maturitySpan;
  const breadthMult = m.breadthBase + Math.min(p.chains.length, m.breadthMaxChains) * m.breadthPerChain;
  const implied = Math.max(1, Math.round(p.tvl_usd * m.baseMultiple * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Rankable: pre-token, not an exchange, not a versioned pool of another protocol. */
export function isRankable(p: SnapProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED_NAME.test(p.name);
}

/** One step as a single string: action, then its cost and time. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function firstChain(p: SnapProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The gas token a farmer needs on a chain, by the chain's own name. */
export function gasToken(chain: string): string {
  const c = chain.toLowerCase();
  if (c.includes('solana')) return 'SOL';
  if (c.includes('bitcoin')) return 'BTC';
  if (c.includes('tron')) return 'TRX';
  if (c.includes('bnb') || c.includes('binance')) return 'BNB';
  if (c.includes('avalanche')) return 'AVAX';
  if (c.includes('polygon')) return 'POL';
  if (c.includes('sui')) return 'SUI';
  if (c.includes('aptos')) return 'APT';
  if (c.includes('near')) return 'NEAR';
  if (c.includes('cosmos')) return 'ATOM';
  if (c.includes('cardano')) return 'ADA';
  return 'ETH';
}

function capitalFor(p: SnapProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 60;
}

function holdDays(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function coreAction(p: SnapProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and leave the supply open so it accrues interest.`;
  if (c.includes('dex')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the LP position open.`;
  if (c.includes('yield') || c.includes('leveraged farm')) return `Deposit $${capital} into ${name}'s highest-TVL strategy on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds inside its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and hold the receipt token it issues.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and take one position in an active market.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('payment')) return `Route $${capital} of payments through ${name} on ${chain} in two separate transfers.`;
  if (c.includes('chain')) return `Use $${capital} of ${name}'s native activity on ${chain}: one transfer and one app interaction.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

function secondAction(p: SnapProtocol, capital: number, chain: string): { text: string; cost: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const q = Math.round(capital / 4);
  const half = Math.round(capital / 2);
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return { text: `Borrow $${q} against the supply on ${name}, then repay it the same week so both sides of the market are used.`, cost: `$${q} borrowed and repaid, $2 of gas` };
  if (c.includes('dex')) return { text: `Swap $${half} through ${name}'s router on ${chain} so the wallet shows trading activity as well as liquidity.`, cost: `$${half} swapped, $2 of gas` };
  if (c.includes('bridge')) return { text: `Bridge $${half} back the other way through ${name} a week later to show repeat use.`, cost: `$${half} bridged, $2 of gas` };
  if (c.includes('staking') || c.includes('restak')) return { text: `Restake the receipt token once through ${name} if it offers a second layer, otherwise delegate a second small stake.`, cost: 'receipt restaked, $2 of gas' };
  if (c.includes('perpetual') || c.includes('derivative')) return { text: `Close the hedge on ${name} after a week and open a fresh one half the size.`, cost: 'half-size position, $2 of gas' };
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return { text: `Vote once in ${name}'s governance or curator forum from the same wallet, if a vote is open.`, cost: 'no capital moved, $2 of gas' };
  if (c.includes('rwa') || c.includes('stable')) return { text: `Redeem a small slice, $${q}, then re-mint it so the wallet shows a full cycle.`, cost: `$${q} redeemed and re-minted, $2 of gas` };
  return { text: `Make a second, different interaction on ${name} on ${chain}: a swap, a vote or a claim, worth about $${q}.`, cost: `about $${q} moved, $2 of gas` };
}

/**
 * Seven farm steps, each with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age). The core and the
 * second action change with the category; the capital, the hold and the
 * gas token change with TVL, age and chain.
 */
export function farmSteps(p: SnapProtocol, age: number | null): FarmStep[] {
  const chain = firstChain(p);
  const gas = gasToken(chain);
  const capital = capitalFor(p);
  const hold = holdDays(age);
  const weeks = hold >= 60 ? 8 : hold >= 45 ? 6 : 4;
  return [
    {
      text: `Open a fresh wallet for this farm only, fund it with $${capital} plus $10 of ${gas} for gas on ${chain}, and keep its seed phrase offline.`,
      cost: `$${capital + 10} funded, about $3 of gas for the first transaction`,
      time: '10 minutes',
    },
    { text: coreAction(p, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: secondAction(p, capital, chain).text, cost: secondAction(p, capital, chain).cost, time: '10 minutes' },
    {
      text: `Repeat one qualifying action every week for ${weeks} weeks, such as a deposit, a swap, a vote or a claim, so the wallet shows steady use.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the main position for at least ${hold} days so the activity spans more than one snapshot window.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Once a week open the protocol's own points or rewards page from its own site and check the balance; never pay to claim and never follow claim links from messages.`,
      cost: 'no fee to check',
      time: '10 minutes a week',
    },
    {
      text: `Log the wallet, the dates and every transaction hash, then plan the exit in two steps: withdraw half first, check it arrived, then withdraw the rest.`,
      cost: 'nothing but the log, about $3 of gas to exit',
      time: '10 minutes to log',
    },
  ];
}

/** The live-token set, by market cap, kept apart from the pre-token board. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** Build the ranked board: every watchlist slug, plus every rankable pre-token protocol below the floor. */
export function buildBoard(snapshot: Snapshot, m: ModelParams = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, m) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((item, i) => ({
    rank: i + 1,
    slug: item.p.slug,
    name: item.p.name,
    category: item.p.category,
    chains: item.p.chains,
    tvl_usd: item.p.tvl_usd,
    change_7d: item.p.change_7d,
    mcap_usd: item.p.mcap_usd,
    listed_at: item.p.listed_at,
    gecko_id: item.p.gecko_id,
    symbol: item.p.symbol,
    token_status: 'pre-token',
    age_days: item.s.age,
    implied_value_usd: item.s.implied,
    model: {
      base_multiple: m.baseMultiple,
      growth_pct: item.s.growthPct,
      growth_multiplier: round4(item.s.growthMult),
      maturity_multiplier: round4(item.s.maturityMult),
      breadth_multiplier: round4(item.s.breadthMult),
      age_days: item.s.age,
    },
    farm_steps: farmSteps(item.p, item.s.age).map(stepText),
  }));
}

export function buildRadar(snapshot: Snapshot, m: ModelParams = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, m);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: m,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      breadth_multiplier: r.model.breadth_multiplier,
      watchlist: snapshot.watchlist.includes(r.slug),
    })),
    live,
  };
  return { board, radar };
}

/** Parse the sealed snapshot, refusing anything that is not its shape. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** The first gate failure in a board, or null when the board is gate-shaped. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share implied value ${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard dataset as one script the page reads with no fetch. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
