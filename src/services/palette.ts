import type { GroupedYields, YieldOpportunity } from "../types/yields.ts";

/**
 * Palette Finance API
 *
 * Provides more accurate APR values for a subset of TON protocols.
 * We use Palette's value as an OVERRIDE for the yields it covers, and fall
 * back to our existing sources (DefiLlama, Swap Coffee, etc.) for everything
 * else.
 *
 * Response shape:
 * {
 *   "aprBySource": { "evaa_main_pool": 1.88, "storm_vault_usdt": 5.87, ... },
 *   "aprBySymbol": { "tsTON": 13.70, "hTON": 19.53, ... },
 *   "fetchedAt": "2026-06-10T11:30:22.531Z"
 * }
 */
const PALETTE_API = "https://palette.finance/api/public/apr/all";

interface PaletteResponse {
  aprBySource: Record<string, number | null>;
  aprBySymbol: Record<string, number | null>;
  fetchedAt: string;
}

/**
 * An override rule maps a Palette API key to a predicate that identifies the
 * specific yield in our pipeline whose APR should be replaced.
 *
 * `table` selects which Palette section the `key` lives in.
 * `match` returns true for the yield(s) the Palette value applies to.
 */
interface OverrideRule {
  key: string;
  table: "aprBySource" | "aprBySymbol";
  /** Human-readable description (used in logs) */
  label: string;
  match: (y: YieldOpportunity) => boolean;
  /**
   * Optional disambiguator when `match` returns multiple yields but the
   * Palette value applies to only one (e.g. two same-looking Daolama TON
   * pools). Receives all matches, returns the subset to override.
   */
  selector?: (matches: YieldOpportunity[]) => YieldOpportunity[];
}

/** Selector: keep only the single highest-TVL match. */
const highestTvl = (matches: YieldOpportunity[]): YieldOpportunity[] => {
  if (matches.length === 0) return [];
  return [matches.reduce((best, y) => (y.tvlUsd > best.tvlUsd ? y : best))];
};

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const has = (s: string | null | undefined, sub: string) =>
  (s ?? "").toLowerCase().includes(sub.toLowerCase());

/**
 * Override rules — extend this table as Palette adds coverage or as
 * ambiguous mappings get confirmed.
 *
 * Only HIGH-CONFIDENCE mappings are enabled. Ambiguous Palette keys
 * (e.g. EVAA per-market pools, Daolama, affluent_basic_market, storm_staking)
 * are intentionally omitted so those yields keep their existing source values.
 */
const OVERRIDE_RULES: OverrideRule[] = [
  // --- Liquid staking tokens (aprBySymbol) ---
  {
    key: "tsTON",
    table: "aprBySymbol",
    label: "Tonstakers (tsTON)",
    match: (y) => eq(y.source, "Tonstakers"),
  },
  {
    key: "hTON",
    table: "aprBySymbol",
    label: "Hipo (hTON)",
    match: (y) => eq(y.source, "Hipo"),
  },
  {
    key: "bmTON",
    table: "aprBySymbol",
    label: "Bemo (bmTON)",
    match: (y) => eq(y.source, "Bemo") && (has(y.poolMeta, "bmTON") || has(y.asset, "bmTON")),
  },
  {
    key: "KTON",
    table: "aprBySymbol",
    label: "KTON (KTON)",
    match: (y) => eq(y.source, "KTON"),
  },
  {
    key: "STAKED",
    table: "aprBySymbol",
    label: "Stakee (STAKED)",
    match: (y) => eq(y.source, "Stakee"),
  },

  // --- Specific pools (aprBySource) ---
  {
    key: "storm_vault_usdt",
    table: "aprBySource",
    label: "Storm Trade USDT vault",
    match: (y) => eq(y.source, "Storm Trade") && eq(y.asset, "USDT"),
  },
  {
    key: "affluent_lending_vault_usdt",
    table: "aprBySource",
    label: "Affluent USDT lending vault",
    match: (y) => eq(y.source, "Affluent") && eq(y.asset, "USDT"),
  },
  // EVAA: Palette's main/lp/stable keys correspond to EVAA's USDT pools.
  // (We don't currently surface a USDT "stable" pool, so evaa_stable_pool is
  // intentionally unmapped; evaa USDT/Alts isn't covered by Palette.)
  {
    key: "evaa_main_pool",
    table: "aprBySource",
    label: "EVAA USDT Main pool",
    match: (y) => eq(y.source, "EVAA") && eq(y.asset, "USDT") && has(y.poolMeta, "Main"),
  },
  {
    key: "evaa_lp_pool",
    table: "aprBySource",
    label: "EVAA USDT LP pool",
    match: (y) => eq(y.source, "EVAA") && eq(y.asset, "USDT") && has(y.poolMeta, "LP"),
  },
  // Daolama: two TON pools share the same source/asset/meta; the higher-TVL
  // one is the Main Pool (the other is "Gifts Pool", left untouched).
  {
    key: "daolama_main_pool",
    table: "aprBySource",
    label: "Daolama Main Pool (highest TVL)",
    match: (y) => eq(y.source, "Daolama") && eq(y.asset, "TON"),
    selector: highestTvl,
  },
];

/**
 * Fetch the Palette Finance APR data. Returns null on failure so the caller
 * can gracefully fall back to existing source values.
 */
export async function fetchPaletteData(): Promise<PaletteResponse | null> {
  try {
    console.log("Fetching APR overrides from Palette Finance...");
    const response = await fetch(PALETTE_API, { signal: AbortSignal.timeout(15000) });

    if (!response.ok) {
      console.error(`Palette API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as PaletteResponse;
    return data;
  } catch (error) {
    console.error("Failed to fetch Palette data:", error);
    return null;
  }
}

/**
 * Apply Palette APR overrides in-place across all asset categories.
 * For each rule with a valid (non-null) Palette value, every matching yield
 * has its APR replaced. Single-sided yields (reward = null) get apyBase and
 * apyTotal set to the Palette value.
 *
 * Returns the number of yields overridden (for logging).
 */
export function applyPaletteOverrides(
  grouped: GroupedYields,
  palette: PaletteResponse | null,
): number {
  if (!palette) return 0;

  const allCategories = [
    grouped.TON,
    grouped.STABLE,
    grouped.BTC,
    grouped.ETH,
    grouped.TON_USDT,
  ];

  let overrideCount = 0;

  for (const rule of OVERRIDE_RULES) {
    const value = palette[rule.table]?.[rule.key];
    if (value === null || value === undefined || !(value > 0)) {
      continue; // No usable Palette value for this key
    }

    // Collect all matches across categories, then narrow with the optional selector.
    const matches: YieldOpportunity[] = [];
    for (const category of allCategories) {
      for (const y of category) {
        if (rule.match(y)) matches.push(y);
      }
    }
    const targets = rule.selector ? rule.selector(matches) : matches;

    for (const y of targets) {
      // Replace APR with the more accurate Palette value.
      if (y.apyReward && y.apyReward > 0) {
        // Reward-bearing pool: treat Palette value as the new total,
        // keep base, recompute reward as the remainder (clamped at 0).
        y.apyTotal = value;
        y.apyReward = Math.max(0, value - y.apyBase);
      } else {
        y.apyBase = value;
        y.apyReward = null;
        y.apyTotal = value;
      }

      overrideCount++;
      console.log(`  ↳ Palette override: ${rule.label} → ${value.toFixed(2)}%`);
    }
  }

  return overrideCount;
}
