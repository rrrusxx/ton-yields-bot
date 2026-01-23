import type { AssetType } from "../types/yields.ts";

/**
 * Protocol URL mappings
 * Maps DefiLlama project names to their Telegram Mini Apps or websites
 */
export const PROTOCOL_URLS: Record<string, string> = {
  // Liquid Staking
  "tonstakers": "https://tonstakers.com/",
  "bemo": "https://www.bemo.finance/",
  "bemo_v2": "https://www.bemo.finance/",
  "hipo": "https://hipo.finance/",
  "kton": "https://kton.io/",
  "stakee": "https://stakee.ton.org/",
  "torch_finance": "https://torchfinance.org/",
  
  // Lending Protocols (TMAs)
  "evaa": "https://t.me/EvaaAppBot",
  "evaa-protocol": "https://t.me/EvaaAppBot",
  "morpho": "https://t.me/MorphoOrgBot",
  "euler": "https://t.me/EulerFinanceBot",
  "affluent": "https://t.me/AffluentAppBot",
  
  // Yield Protocols
  "fiva": "https://t.me/fiva_yield_bot",
  "daolama": "https://daolama.co/",
  "dao_lama_vault": "https://daolama.co/",
  "yieldfi": "https://t.me/yieldfi_bot",
  "yield-fi": "https://t.me/yieldfi_bot",
  "yield.fi": "https://t.me/yieldfi_bot",
  "ethena": "https://app.ethena.fi/earn/ton",
  
  // DEXs
  "ston-fi": "https://app.ston.fi/pools",
  "ston.fi": "https://app.ston.fi/pools",
  "stonfi": "https://app.ston.fi/pools",
  "stonfi_v2": "https://app.ston.fi/pools",
  "dedust": "https://dedust.io/pools",
  "tonco": "https://tonco.io/",
  "curve": "https://t.me/CurveAppBot",
  "curve-dex": "https://t.me/CurveAppBot",
  "swap-coffee": "https://swap.coffee/earn",
  "swap.coffee": "https://swap.coffee/earn",
  "swapcoffee": "https://swap.coffee/earn",
  "coffee": "https://swap.coffee/earn",
  "moon": "https://moon.ton.org/",
  "bidask": "https://bidask.io/",
  
  // TAC DEXs
  "carbon": "https://t.me/CarbonDefiAppBot",
  "carbon-defi": "https://t.me/CarbonDefiAppBot",
  "carbondefi": "https://t.me/CarbonDefiAppBot",
  "bancor": "https://t.me/CarbonDefiAppBot",
  "snap": "https://www.snap.club/",
  "snap-dex": "https://www.snap.club/",
  "snapdex": "https://www.snap.club/",
  
  // Perpetuals/Trading
  "storm-trade": "https://t.me/StormTradeBot",
};

/**
 * Default URL - empty string means we skip showing DefiLlama links
 * Protocols without proper URLs won't have clickable links
 */
const DEFAULT_URL = "";

/**
 * Get the URL for a protocol
 */
export function getProtocolUrl(project: string, _poolUrl?: string | null): string {
  // Try exact match first
  const normalizedProject = project.toLowerCase().replace(/[\s_]/g, "-");
  if (PROTOCOL_URLS[normalizedProject]) {
    return PROTOCOL_URLS[normalizedProject];
  }
  
  // Try without dashes
  const noDashes = normalizedProject.replace(/-/g, "");
  if (PROTOCOL_URLS[noDashes]) {
    return PROTOCOL_URLS[noDashes];
  }
  
  // Try original lowercase
  const original = project.toLowerCase();
  if (PROTOCOL_URLS[original]) {
    return PROTOCOL_URLS[original];
  }
  
  return DEFAULT_URL;
}

/**
 * Excluded assets - memecoins and other assets we don't want to show
 */
const EXCLUDED_ASSETS = [
  "NOT",      // Notcoin - memecoin
  "DOGS",     // Dogs - memecoin
  "HMSTR",    // Hamster - memecoin
  "CATI",     // Catizen - memecoin
  "REDO",     // Memecoin
  "JETTON",   // Generic/spam
  "PUNK",     // Memecoin
  "ANON",     // Memecoin
];

/**
 * Check if an asset should be excluded
 */
export function isExcludedAsset(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase();
  return EXCLUDED_ASSETS.some(excluded => 
    upperSymbol === excluded || 
    upperSymbol.startsWith(excluded + "-") ||
    upperSymbol.endsWith("-" + excluded) ||
    upperSymbol.includes("-" + excluded + "-")
  );
}

/**
 * ETH and related assets - NOT included in TON yields
 * These are TAC-bridged Ethereum assets we want to exclude
 */
const ETH_ASSETS = [
  "ETH",
  "WETH",
  // Lido
  "stETH",
  "wstETH",
  "STETH",
  "WSTETH",
  // Rocket Pool
  "rETH",
  "RETH",
  // Kelp
  "rsETH",
  "wrsETH",
  "RSETH",
  "WRSETH",
  // Puffer
  "pufETH",
  "PUFETH",
  // EtherFi
  "eETH",
  "weETH",
  "EETH",
  "WEETH",
];

/**
 * Check if an asset is an ETH asset (should be excluded from our feeds)
 */
export function isEthAsset(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return ETH_ASSETS.some(eth => 
    upperSymbol === eth.replace(/[^A-Z0-9]/g, "") || 
    upperSymbol.startsWith(eth.replace(/[^A-Z0-9]/g, ""))
  );
}

/**
 * Stablecoin asset identifiers
 * Includes native TON stables and TAC-bridged assets
 */
const STABLE_ASSETS = [
  // Native/Common
  "USDT",
  "USD₮",
  "USDC",
  "DAI",
  // Ethena
  "USDE",
  "SUSDE",
  "TSUSDE",
  // Resolv
  "USR",
  "RLP",
  "WSTUSR",
  "STUSR",
  // Usual
  "USD0",
  "USD0++",
  // USN
  "USN",
  "SUSN",
  // Other stables
  "TUSD",
  "BUSD",
  "FRAX",
  "LUSD",
];

/**
 * Bitcoin asset identifiers
 */
const BTC_ASSETS = [
  "cbBTC",
  "WBTC",
  "tBTC",
  "BTC",
  "LBTC",
  "M-BTC",
  "MBTC",
];

/**
 * TON and related assets (LSTs, etc.)
 */
const TON_ASSETS = [
  "TON",
  "TSTON",
  "STTON",
  "HTON",
  "BMTON",
  "WTON",
];

/**
 * Correlated pairs - assets that move together (no impermanent loss risk)
 */
const CORRELATED_PAIRS: Record<AssetType, string[][]> = {
  // TON and LSTs are correlated
  TON: [
    ["TON", "TSTON"],
    ["TON", "STTON"],
    ["TON", "HTON"],
    ["TON", "BMTON"],
    ["TSTON", "STTON"],
    ["TSTON", "HTON"],
    ["STTON", "HTON"],
    ["STTON", "BMTON"],
  ],
  // Stablecoins are correlated with each other
  STABLE: [
    ["USDT", "USDC"],
    ["USDT", "USDE"],
    ["USDT", "USN"],
    ["USDT", "USD0"],
    ["USDT", "USR"],
    ["USDT", "DAI"],
    ["USDC", "USDE"],
    ["USDC", "USN"],
    ["USDC", "USD0"],
    ["USDC", "USR"],
    ["USDE", "USN"],
    ["USDE", "USD0"],
    ["USDE", "USR"],
    ["USDE", "SUSDE"],
    ["USDE", "TSUSDE"],  // tsUSDE is staked USDE
    ["TSUSDE", "SUSDE"], // tsUSDE and sUSDE are the same asset
    ["TSUSDE", "USDT"],  // tsUSDE-USDT is correlated (both stablecoins)
    ["TSUSDE", "USDC"],  // tsUSDE-USDC is correlated (both stablecoins)
    ["USN", "USD0"],
    ["USN", "USR"],
    ["USD0", "USR"],
    ["USR", "WSTUSR"],
    ["USR", "RLP"],
  ],
  // BTC variants are correlated
  BTC: [
    ["BTC", "WBTC"],
    ["BTC", "cbBTC"],
    ["BTC", "LBTC"],
    ["cbBTC", "LBTC"],
    ["cbBTC", "WBTC"],
    ["LBTC", "WBTC"],
    ["cbBTC", "MBTC"],
  ],
};

/**
 * Classify an asset symbol into asset type category
 */
export function classifyAsset(symbol: string): AssetType {
  const upperSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  
  // Check for stablecoins first (more specific)
  if (STABLE_ASSETS.some(stable => upperSymbol.includes(stable.replace(/[^A-Z0-9]/g, "")))) {
    return "STABLE";
  }
  
  // Check for BTC assets
  if (BTC_ASSETS.some(btc => upperSymbol.includes(btc.replace(/[^A-Z0-9]/g, "")))) {
    return "BTC";
  }
  
  // Default to TON category
  return "TON";
}

/**
 * Check if a symbol represents a single asset (not a pair/LP)
 */
export function isSingleAsset(symbol: string): boolean {
  // LP tokens usually have "-" or "/" in the name
  return !symbol.includes("-") && !symbol.includes("/");
}

/**
 * Parse LP pair symbol into two assets
 * e.g., "TON-USDT" -> ["TON", "USDT"]
 */
export function parseLpPair(symbol: string): [string, string] | null {
  const parts = symbol.split(/[-\/]/);
  
  // Handle 2-part symbols (standard LP pairs)
  if (parts.length === 2) {
    return [parts[0].toUpperCase(), parts[1].toUpperCase()];
  }
  
  // Handle multi-part symbols with vault/pool identifiers
  // Examples: TSUSDE-USDT-VAULT7, TON-TSTON-TSUSDE-USDT-XAUT0, TSUSDE-USDE-USDT
  if (parts.length >= 3) {
    // Filter out known vault/pool suffixes
    const vaultSuffixes = ["VAULT", "POOL", "LP", "XAUT", "MAIN", "STABLE", "ALTS"];
    const assetParts = parts.filter(part => {
      const upperPart = part.toUpperCase();
      // Remove parts that are vault suffixes or numbers
      return !vaultSuffixes.some(suffix => upperPart.includes(suffix)) && 
             !/^\d+$/.test(part); // Remove numeric parts like "7" in "VAULT7"
    });
    
    // If we have exactly 2 assets after filtering, use them
    if (assetParts.length === 2) {
      return [assetParts[0].toUpperCase(), assetParts[1].toUpperCase()];
    }
    
    // If we have 3+ assets (multi-asset pool), take first 2 as primary pair
    if (assetParts.length >= 3) {
      // For pools like TSUSDE-USDE-USDT, we want to identify the main pair
      // Take the first two non-duplicate assets
      const uniqueAssets = [...new Set(assetParts.map(p => p.toUpperCase()))];
      if (uniqueAssets.length >= 2) {
        return [uniqueAssets[0], uniqueAssets[1]];
      }
    }
  }
  
  return null;
}

/**
 * Check if a pool is a TON-USDT liquidity pool
 * Returns true ONLY for exact TON-USDT or USDT-TON pairs
 * Excludes LSTs (tsTON, stTON, etc.) and other tokens (STON, TONNEL, etc.)
 */
export function isTonUsdtPool(symbol: string): boolean {
  const pair = parseLpPair(symbol);
  if (!pair) {
    return false;
  }
  
  let [asset1, asset2] = pair;
  
  // Normalize unicode USDT variants (USD₮ -> USDT)
  asset1 = asset1.replace(/USD₮/g, "USDT");
  asset2 = asset2.replace(/USD₮/g, "USDT");
  
  // Check for EXACT "TON" (not tsTON, TONNEL, STON, etc.)
  const isTon1 = asset1 === "TON";
  const isTon2 = asset2 === "TON";
  
  // Check for EXACT "USDT" or common variants (tsUSDT, USDT.e)
  const isUsdt1 = asset1 === "USDT" || asset1 === "TSUSDT" || asset1 === "USDT.E";
  const isUsdt2 = asset2 === "USDT" || asset2 === "TSUSDT" || asset2 === "USDT.E";
  
  // One must be TON and the other must be USDT
  return (isTon1 && isUsdt2) || (isTon2 && isUsdt1);
}

/**
 * Check if an LP pair consists of correlated assets
 */
export function isCorrelatedPair(symbol: string, assetType: AssetType): boolean {
  // Single assets are always "correlated" (no IL risk)
  if (isSingleAsset(symbol)) {
    return true;
  }
  
  const pair = parseLpPair(symbol);
  if (!pair) {
    return false;
  }
  
  const [asset1, asset2] = pair;
  const correlatedPairs = CORRELATED_PAIRS[assetType];
  
  // Check if this pair exists in correlated pairs (order doesn't matter)
  return correlatedPairs.some(([a, b]) => 
    (asset1.includes(a) && asset2.includes(b)) ||
    (asset1.includes(b) && asset2.includes(a))
  );
}

/**
 * Check if an LP pair belongs to a specific asset category
 */
export function pairBelongsToCategory(symbol: string, assetType: AssetType): boolean {
  // Single assets - check directly
  if (isSingleAsset(symbol)) {
    return classifyAsset(symbol) === assetType;
  }
  
  const pair = parseLpPair(symbol);
  if (!pair) {
    return false;
  }
  
  const [asset1, asset2] = pair;
  
  // For TON category: both assets should be TON-related
  if (assetType === "TON") {
    const isTon1 = TON_ASSETS.some(t => asset1.includes(t));
    const isTon2 = TON_ASSETS.some(t => asset2.includes(t));
    return isTon1 && isTon2;
  }
  
  // For STABLE category: both assets should be stablecoins
  if (assetType === "STABLE") {
    const isStable1 = STABLE_ASSETS.some(s => asset1.includes(s.replace(/[^A-Z0-9]/g, "")));
    const isStable2 = STABLE_ASSETS.some(s => asset2.includes(s.replace(/[^A-Z0-9]/g, "")));
    return isStable1 && isStable2;
  }
  
  // For BTC category: both assets should be BTC-related
  if (assetType === "BTC") {
    const isBtc1 = BTC_ASSETS.some(b => asset1.includes(b));
    const isBtc2 = BTC_ASSETS.some(b => asset2.includes(b));
    return isBtc1 && isBtc2;
  }
  
  return false;
}

/**
 * Format protocol name for display
 */
export function formatProtocolName(project: string): string {
  const specialNames: Record<string, string> = {
    "ston-fi": "Ston.fi",
    "ston.fi": "Ston.fi",
    "stonfi": "Ston.fi",
    "dedust": "DeDust",
    "evaa": "EVAA",
    "evaa-protocol": "EVAA",
    "tonstakers": "Tonstakers",
    "tonco": "Tonco",
    "megaton-finance": "Megaton",
    "bemo": "Bemo",
    "hipo": "Hipo",
    "storm-trade": "Storm Trade",
    "morpho": "Morpho",
    "euler": "Euler",
    "affluent": "Affluent",
    "curve": "Curve",
    "curve-dex": "Curve",
    "fiva": "FIVA",
    "daolama": "Daolama",
    "swap-coffee": "Swap.coffee",
    "swap.coffee": "Swap.coffee",
    "swapcoffee": "Swap.coffee",
    // TAC dApps
    "carbon": "Carbon",
    "carbon-defi": "Carbon",
    "carbondefi": "Carbon",
    "bancor": "Bancor",
    "snap": "Snap",
    "snap-dex": "Snap",
    "snapdex": "Snap",
  };
  
  const normalized = project.toLowerCase();
  if (specialNames[normalized]) {
    return specialNames[normalized];
  }
  
  // Default: capitalize first letter of each word
  return project
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
