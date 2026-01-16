/**
 * TON Chain TVL Service
 * Fetches total DeFi TVL for TON chain from DefiLlama
 * 
 * Matches DefiLlama website's "Total Value Locked in DeFi" metric
 * - Includes: DeFi protocols (DEXs, Lending, Derivatives, etc.)
 * - Excludes: CEXs, Liquid Staking Tokens (LST/LSD)
 */

interface DefiLlamaProtocol {
  name: string;
  chains: string[];
  chain?: string;
  chainTvls?: Record<string, number>;
  category?: string;
}

const DEFILLAMA_PROTOCOLS_API = "https://api.llama.fi/protocols";

/**
 * Categories to exclude from DeFi TVL calculation
 * These match DefiLlama's website filtering
 */
const EXCLUDED_CATEGORIES = [
  "CEX",           // Centralized exchanges
  "Liquid Staking", // LST/LSD tokens (counted separately on website)
  "LSD",           // Liquid Staking Derivatives
];

/**
 * Check if a protocol should be excluded from DeFi TVL
 */
function isExcludedProtocol(protocol: DefiLlamaProtocol): boolean {
  const category = protocol.category?.toLowerCase() || "";
  const name = protocol.name.toLowerCase();
  
  // Check if category matches excluded list
  if (EXCLUDED_CATEGORIES.some(excluded => category.includes(excluded.toLowerCase()))) {
    return true;
  }
  
  // Explicitly exclude known CEXs by name
  const cexNames = ["binance", "bybit", "kucoin", "bitget", "htx", "okx", "gate.io"];
  if (cexNames.some(cex => name.includes(cex))) {
    return true;
  }
  
  return false;
}

/**
 * Fetch total DeFi TVL for TON chain
 * Returns the TVL in USD (matches DefiLlama website's value)
 */
export async function fetchTonTVL(): Promise<number> {
  try {
    const response = await fetch(DEFILLAMA_PROTOCOLS_API);
    
    if (!response.ok) {
      throw new Error(`DefiLlama API error: ${response.status} ${response.statusText}`);
    }
    
    const protocols: DefiLlamaProtocol[] = await response.json();
    
    // Filter for TON protocols
    const tonProtocols = protocols.filter((p) =>
      p.chains?.includes("TON") || p.chain === "TON"
    );
    
    // Sum TVL for DeFi protocols only (exclude CEX and LST)
    let totalTvl = 0;
    for (const protocol of tonProtocols) {
      if (!isExcludedProtocol(protocol)) {
        const chainTvl = protocol.chainTvls?.TON || 0;
        totalTvl += chainTvl;
      }
    }
    
    return totalTvl;
  } catch (error) {
    console.error("Failed to fetch TON TVL:", error);
    // Return 0 instead of throwing to prevent message generation from failing
    return 0;
  }
}

/**
 * Format TVL for display (e.g., "$92.5M")
 */
export function formatTVL(tvl: number): string {
  if (tvl === 0) return "$0";
  
  const millions = tvl / 1000000;
  
  if (millions >= 1000) {
    // Format as billions if > $1B
    return `$${(millions / 1000).toFixed(2)}B`;
  } else {
    // Format as millions
    return `$${millions.toFixed(1)}M`;
  }
}
