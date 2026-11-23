import type { GroupedYields, YieldOpportunity } from "../types/yields.ts";

/**
 * Palette Finance API
 *
 * Provides APR values (and, for a few pools, TVL) for a subset of TON protocols.
 * We use Palette's value as an OVERRIDE for the yields it covers, and fall
 * back to our existing sources (DefiLlama, Swap Coffee, etc.) for everything
 * else.
 *
 * Response shape:
 * {
 *   "aprBySource": { "evaa_main_pool": 1.88, "storm_vault_usdt": 5.87, ... },
 *   "aprBySymbol": { "tsTON": 13.70, "hGRAM": 19.53, ... },
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
  /**
   * Optional aprBySource key ("tvl:...") holding the pool's TVL in USD.
   * Used where the base source reports a wrong TVL.
   */
  tvlKey?: string;
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
    key: "hGRAM",
    table: "aprBySymbol",
    label: "Hipo (hGRAM)",
    match: (y) => eq(y.source, "Hipo"),
    // Swap.coffee values Hipo at hGRAM supply x GRAM price, but each hGRAM is
    // worth about 1.2 GRAM, so its TVL is about 17% too low. Palette's TVL
    // matches the GRAM staked in the treasury contract and DefiLlama.
    tvlKey: "tvl:hGRAM",
  },
  {
    key: "bmGRAM",
    table: "aprBySymbol",
    label: "Bemo (bmGRAM)",
    match: (y) => eq(y.source, "Bemo") && (has(y.poolMeta, "bmTON") || has(y.poolMeta, "bmGRAM") || has(y.asset, "bmTON") || has(y.asset, "bmGRAM")),
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
  // Storm Trade vaults: Palette's APR is Storm's own one-year figure. It
  // applies to Swap.coffee's fallback rows only; the rows read from the vault
  // contracts keep their own APY and TVL. Palette's TVL is not used: it adds
  // the locked balance (traders' collateral) to the LPs' free balance, while
  // Swap.coffee and Storm's app show the free balance (until 2026-11-23 the
  // TVL came from Palette, on the wrong idea that the locked part was LP money).
  {
    key: "storm_vault_usdt",
    table: "aprBySource",
    label: "Storm Trade USDT vault",
    match: (y) => eq(y.source, "Storm Trade") && eq(y.asset, "USDT"),
  },
  {
    key: "storm_vault_ton",
    table: "aprBySource",
    label: "Storm Trade GRAM vault",
    match: (y) => eq(y.source, "Storm Trade") && (eq(y.asset, "GRAM") || eq(y.asset, "TON")),
  },
  // Affluent USDT override removed (2026-11-20): Affluent was exploited, and
  // Palette's affluent_lending_vault_usdt value sits on a vault with only a
  // few dollars of TVL.
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
  // Daolama override removed — project closed (Jul 2026)
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

  const positive = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

  for (const rule of OVERRIDE_RULES) {
    const value = positive(palette[rule.table]?.[rule.key]);
    const tvl = rule.tvlKey ? positive(palette.aprBySource?.[rule.tvlKey]) : null;
    if (value === null && tvl === null) {
      continue; // No usable Palette value for this rule
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
      if (y.onChain) {
        // Our own contract reading wins; Palette is only a cross-check here
        if (value !== null) {
          const gap = value - y.apyTotal;
          const note = `  ↳ Palette check: ${rule.label} on-chain ${y.apyTotal.toFixed(2)}% vs Palette ${value.toFixed(2)}%`;
          if (Math.abs(gap) > 1) {
            console.warn(`${note} (differs by ${gap.toFixed(2)} pp)`);
          } else {
            console.log(note);
          }
        }
        continue;
      }
      if (value !== null) {
        // Replace APR with the Palette value.
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

      if (tvl !== null) {
        y.tvlUsd = tvl;
        console.log(`  ↳ Palette TVL: ${rule.label} → $${(tvl / 1_000_000).toFixed(2)}M`);
      }
    }
  }

  return overrideCount;
}
