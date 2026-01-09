/**
 * Asset type categories for TON yields
 */
export type AssetType = "TON" | "STABLE" | "BTC";

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
}
