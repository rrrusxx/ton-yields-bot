/**
 * Asset type categories for TON yields
 */
export type AssetType = "TON" | "STABLE" | "BTC" | "ETH";

/**
 * Represents a single yield opportunity from any protocol
 */
export interface YieldOpportunity {
  /** Category of asset (TON, STABLE, BTC) */
  assetType: AssetType;
  /** Protocol/project name */
  source: string;
  /** Direct link to the yield opportunity */
  sourceUrl: string;
  /** Asset symbol (e.g., "stTON", "USDT") */
  asset: string;
  /** Pool metadata/label (e.g., "Main", "Isolated") */
  poolMeta: string | null;
  /** Base/underlying APY percentage */
  apyBase: number;
  /** Incentive/reward APY (null if none) */
  apyReward: number | null;
  /** Combined total APY (base + reward) */
  apyTotal: number;
  /** Total Value Locked in USD */
  tvlUsd: number;
  /** Flag for TON-USDT pools (has impermanent loss risk) */
  isTonUsdtPool?: boolean;
  /**
   * True when the TVL is unknown or not trustworthy (for example, the GRAM
   * price needed to convert it to USD was unavailable). The post then shows
   * no TVL for the row, and the row cannot enter the TOP-5.
   */
  tvlHidden?: boolean;
  /**
   * True when the APY (and TVL) was computed by the bot itself from the
   * protocol's contract (src/services/onchain.ts). Palette never overrides
   * such rows, and the post credits "⛓️ on-chain" in its footer.
   */
  onChain?: boolean;
  /**
   * The row's own 7-day APY, when the source measures it directly (the
   * on-chain engine). The post shows it instead of the average of saved
   * daily snapshots.
   */
  apy7d?: number;
  /** Contract address of the pool, when the source reports it */
  poolAddress?: string;
  /** Custom APY label shown in place of the 7-day average (e.g. "5y avg") */
  apyNote?: string;
  /**
   * True when the APY is the pool's own estimate rather than a measured
   * rate (TON Whales native staking, from tonapi). The post marks it "est."
   * and shows no 7-day value.
   */
  apyEstimate?: boolean;
  /**
   * A data provider to credit in the footer for this row, beyond the fixed
   * list (DefiLlama, Swap.coffee, Palette); for example tonapi.
   */
  footerCredit?: { name: string; url: string };
  /** Pool utilization as a percentage (0-100), e.g. for lending/borrow markets */
  utilizationPct?: number;
}

/**
 * Raw response from DefiLlama pools API
 */
export interface DefiLlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  rewardTokens: string[] | null;
  underlyingTokens: string[] | null;
  poolMeta: string | null;
  url: string | null;
}

/**
 * DefiLlama API response structure
 */
export interface DefiLlamaResponse {
  status: string;
  data: DefiLlamaPool[];
}

/**
 * Grouped yields by asset type for formatting
 */
export interface GroupedYields {
  TON: YieldOpportunity[];
  STABLE: YieldOpportunity[];
  BTC: YieldOpportunity[];
  ETH: YieldOpportunity[];
  TON_USDT: YieldOpportunity[];
}

/**
 * Yields grouped by protocol within an asset category
 */
export interface ProtocolGroup {
  protocol: string;
  protocolUrl: string;
  yields: YieldOpportunity[];
}

/**
 * Yields organized by asset type, then by protocol
 */
export interface OrganizedYields {
  TON: ProtocolGroup[];
  STABLE: ProtocolGroup[];
  BTC: ProtocolGroup[];
  ETH: ProtocolGroup[];
  TON_USDT: ProtocolGroup[];
}
