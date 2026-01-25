/**
 * Production Backfill Script for APY History
 * Run this ONCE in production to populate cloud Deno KV with historical data
 * 
 * Usage:
 * deno run --unstable-kv --allow-env backfill_production_apy.ts
 */

interface HistoricalSnapshot {
  date: string;
  source: string;
  asset: string;
  poolMeta: string | null;
  apy: number;
}

/**
 * Parse a single yield line to extract APY
 */
function parseYieldLine(line: string): { asset: string; poolMeta: string | null; apy: number } | null {
  // Skip reward-based yields - we need total APY
  if (line.includes("(+") && line.includes("%)")) {
    // Extract total APY for reward-based pools: "0.0% (+22.4%)" = 22.4% total
    const rewardMatch = line.match(/\((\+[\d.]+%)\)/);
    const assetMatch = line.match(/[├└]\s+([^:]+):/);
    
    if (rewardMatch && assetMatch) {
      const rewardApy = parseFloat(rewardMatch[1].replace("+", "").replace("%", ""));
      const assetPart = assetMatch[1].trim();
      
      // Extract poolMeta if exists
      const metaMatch = assetPart.match(/^(.+?)\s+\(([^)]+)\)$/);
      
      if (metaMatch) {
        return {
          asset: metaMatch[1].trim(),
          poolMeta: metaMatch[2].trim(),
          apy: rewardApy, // Total APY for reward pools
        };
      }
      
      return {
        asset: assetPart.trim(),
        poolMeta: null,
        apy: rewardApy,
      };
    }
    
    return null;
  }
  
  // Regular APY: "├ yUSD: 9.0% | $31.2M"
  const match = line.match(/[├└]\s+([^:]+):\s+([\d.]+)%\s+\|/);
  if (!match) {
    return null;
  }
  
  const assetPart = match[1].trim();
  const apy = parseFloat(match[2]);
  
  // Extract poolMeta if it exists in parentheses
  const metaMatch = assetPart.match(/^(.+?)\s+\(([^)]+)\)$/);
  
  if (metaMatch) {
    return {
      asset: metaMatch[1].trim(),
      poolMeta: metaMatch[2].trim(),
      apy,
    };
  }
  
  return {
    asset: assetPart.trim(),
    poolMeta: null,
    apy,
  };
}

/**
 * Parse message to extract all yields
 */
function parseMessage(message: string, date: string): HistoricalSnapshot[] {
  const snapshots: HistoricalSnapshot[] = [];
  const lines = message.split("\n");
  
  let currentProtocol = "";
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip headers, separators, etc
    if (!trimmed || trimmed.startsWith("━") || trimmed.startsWith("TON Yields") || 
        trimmed.startsWith("Legend:") || trimmed.startsWith("Data:") ||
        trimmed.startsWith("TOP 5") || trimmed.includes("💎") ||
        trimmed.match(/^[A-Z\s&]+$/) || trimmed.startsWith("Jan") ||
        trimmed.match(/^\d+\./)) {
      continue;
    }
    
    // Protocol name (no prefix)
    if (!trimmed.startsWith("├") && !trimmed.startsWith("└")) {
      currentProtocol = trimmed;
      continue;
    }
    
    // Parse yield line
    const parsed = parseYieldLine(trimmed);
    if (parsed && currentProtocol) {
      snapshots.push({
        date,
        source: currentProtocol,
        asset: parsed.asset,
        poolMeta: parsed.poolMeta,
        apy: parsed.apy,
      });
    }
  }
  
  return snapshots;
}

/**
 * Generate pool ID (matches apy_history.ts logic)
 */
function generatePoolId(source: string, asset: string, poolMeta: string | null): string {
  const cleanSource = source.replace(/[^a-zA-Z0-9]/g, "");
  const cleanAsset = asset.replace(/[^a-zA-Z0-9]/g, "");
  const cleanMeta = poolMeta ? poolMeta.replace(/[^a-zA-Z0-9]/g, "") : "default";
  return `${cleanSource}-${cleanAsset}-${cleanMeta}`.toLowerCase();
}

/**
 * Save snapshots to Deno KV (production cloud KV)
 */
async function saveSnapshots(snapshots: HistoricalSnapshot[]): Promise<void> {
  // In production, this opens cloud KV automatically
  const kv = await Deno.openKv();
  
  // Group by pool ID
  const poolMap = new Map<string, HistoricalSnapshot[]>();
  
  for (const snapshot of snapshots) {
    const poolId = generatePoolId(snapshot.source, snapshot.asset, snapshot.poolMeta);
    if (!poolMap.has(poolId)) {
      poolMap.set(poolId, []);
    }
    poolMap.get(poolId)!.push(snapshot);
  }
  
  console.log(`\n📦 Saving ${poolMap.size} pools to production KV...\n`);
  
  // Save each pool's history
  for (const [poolId, poolSnapshots] of poolMap) {
    // Load existing history (if any)
    const existing = await kv.get(["apy_history", poolId]);
    const existingSnapshots = existing.value ? (existing.value as any).snapshots || [] : [];
    
    // Merge with new snapshots
    const dateMap = new Map<string, { date: string; apy: number; timestamp: number }>();
    
    for (const snap of existingSnapshots) {
      dateMap.set(snap.date, snap);
    }
    
    for (const snap of poolSnapshots) {
      const date = new Date(snap.date);
      dateMap.set(snap.date, {
        date: snap.date,
        apy: snap.apy,
        timestamp: date.getTime(),
      });
    }
    
    // Sort by date (newest first), keep last 30 days
    const allSnapshots = Array.from(dateMap.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);
    
    // Save to KV
    await kv.set(["apy_history", poolId], {
      poolId,
      snapshots: allSnapshots,
    });
    
    const sample = poolSnapshots[0];
    console.log(`  ✓ ${sample.source} ${sample.asset} ${sample.poolMeta || ""} (${allSnapshots.length} days)`);
  }
  
  kv.close();
  console.log(`\n✅ Backfill complete! ${poolMap.size} pools saved to production KV.`);
}

// Historical messages (Jan 20-24, 2026)
const messages = {
  "2026-01-20": `TON Yields Daily
Jan 20, 2026
💎 TON DeFi TVL: $89.5M

Tonstakers
└ TON-tsTON (tsTON): 2.9% | $72.1M
Stakee
└ TON (STAKED): 3.2% | $14.1M
Storm Trade
└ TON (TON-SLP): 6.7% | $5.9M
Bemo
├ TON-stTON (stTON): 2.4% | $3.8M
└ TON-bmTON (bmTON): 2.4% | $628.4K
EVAA
├ TON (Main): 0.2% | $2.8M
└ TON (LP): 1.9% | $72.6K
Affluent
├ TON: 0.8% | $1.3M
└ TON-TSTON: 5.3% | $1.2M
KTON
└ TON (KTON): 4.1% | $1.9M
Hipo
└ TON-hTON (hTON): 3.3% | $1.3M
Daolama
├ TON (#1): 15.5% | $508.1K
└ TON (#2): 10.3% | $62.1K
Ston.fi
└ TON-tsTON (tsTON): 1.8% | $161.5K
Snap
└ TON-tsTON (Merkl): 0.0% (+21.6%) | $50.8K
Morpho
├ TON (Re7 TON ): 3.4% | $29.7K
└ TON (SingularV TON Tonstakers): 8.1% | $519
Euler
└ TON: 0.5% | $4.6K
YieldFi
├ yUSD: 9.5% | $31.8M
└ vyUSD: 10.1% | $4.5M
Storm Trade
└ USDT: 9.7% | $6.0M
EVAA
├ USDT (Main): 2.5% | $1.7M
├ USDT (LP): 2.4% | $245.1K
├ USDT (Stable): 1.1% | $184.4K
├ TSUSDE (Main): 0.1% | $80.8K
├ USDT (Alts): 0.5% | $17.2K
├ USDE (Main): 2.0% | $16.3K
└ USDE (Stable): 3.6% | $12.2K
Euler
├ USN: 2.4% | $449.2K
└ USD₮: 43.4% | $1.2K
Affluent
└ USDT: 4.0% | $338.6K
FIVA
├ TSUSDE (For buying PT tsUSDe 30JUN2026): 7.6% | $67.0K
└ TSUSDE (For LP | Maturity 30JUN2026): 6.6% | $62.0K
Snap
└ USDT-USR (Merkl): 0.0% (+19.0%) | $57.0K
Morpho
└ USD₮ (Re7 USDT): 0.4% | $1.9K
Ston.fi
├ USDT-TON (USDT): 3.5% | $5.2M
└ USDT-TON (USDT): 5.3% | $5.2M
DeDust
└ TON-USDT (USDT): 11.7% | $931.2K
Tonco
└ TON-USDT (USDT): 81.4% | $249.2K
BidAsk
└ USDT-TON (USDT): 21.4% | $89.9K
Snap
└ USDT-TON (Merkl): 0.0% (+60.1%) | $42.2K
Snap
└ cbBTC-LBTC (Merkl): 0.0% (+16.2%) | $33.2K`,

  "2026-01-21": `TON Yields Daily
Jan 21, 2026
💎 TON DeFi TVL: $88.8M -$686K (-0.77%) 24h

Tonstakers
└ TON-tsTON (tsTON): 2.9% | $71.3M
Stakee
└ TON (STAKED): 3.1% | $13.9M
Storm Trade
└ TON (TON-SLP): 6.6% | $5.8M
Bemo
├ TON-stTON (stTON): 2.4% | $3.8M
└ TON-bmTON (bmTON): 2.4% | $621.6K
EVAA
├ TON (Main): 0.2% | $2.7M
└ TON (LP): 1.8% | $80.3K
Affluent
├ TON: 0.8% | $1.3M
└ TON-TSTON: 5.3% | $1.2M
KTON
└ TON (KTON): 4.1% | $1.9M
Hipo
└ TON-hTON (hTON): 3.3% | $1.3M
Daolama
├ TON (#1): 15.2% | $502.6K
└ TON (#2): 10.9% | $61.5K
Ston.fi
└ TON-tsTON (tsTON): 0.7% | $160.1K
Snap
└ TON-tsTON (Merkl): 0.0% (+22.7%) | $50.1K
Morpho
├ TON (Re7 TON ): 3.4% | $29.7K
└ TON (SingularV TON Tonstakers): 8.1% | $519
Euler
└ TON: 0.5% | $4.6K
YieldFi
├ yUSD: 9.7% | $31.8M
└ vyUSD: 10.1% | $4.5M
Storm Trade
└ USDT: 9.7% | $6.0M
EVAA
├ USDT (Main): 2.5% | $1.7M
├ USDT (LP): 2.4% | $240.7K
├ USDT (Stable): 1.1% | $184.4K
├ TSUSDE (Main): 0.1% | $80.8K
├ USDT (Alts): 0.5% | $17.2K
├ USDE (Main): 2.1% | $16.0K
└ USDE (Stable): 3.6% | $12.2K
Euler
├ USN: 2.4% | $449.2K
└ USD₮: 43.4% | $1.2K
Affluent
└ USDT: 4.0% | $319.6K
FIVA
├ TSUSDE (For buying PT tsUSDe 30JUN2026): 7.6% | $67.4K
└ TSUSDE (For LP | Maturity 30JUN2026): 6.6% | $62.0K
Snap
└ USDT-USR (Merkl): 0.0% (+19.7%) | $57.1K
Morpho
└ USD₮ (Re7 USDT): 0.4% | $1.9K
Ston.fi
├ USDT-TON (USDT): 2.2% | $5.2M
└ USDT-TON (USDT): 3.3% | $5.2M
DeDust
└ TON-USDT (USDT): 12.3% | $932.8K
Tonco
└ TON-USDT (USDT): 60.2% | $232.6K
BidAsk
└ USDT-TON (USDT): 14.5% | $89.1K
Snap
└ USDT-TON (Merkl): 0.0% (+63.2%) | $41.9K
Snap
└ cbBTC-LBTC (Merkl): 0.0% (+17.1%) | $32.5K`,

  "2026-01-22": `TON Yields Daily
Jan 22, 2026
💎 TON DeFi TVL: $89.7M +$836K (+0.94%) 24h

Tonstakers
└ TON-tsTON (tsTON): 2.9% | $73.1M
Stakee
└ TON (STAKED): 3.1% | $14.3M
Storm Trade
└ TON (TON-SLP): 6.6% | $6.0M
Bemo
├ TON-stTON (stTON): 2.4% | $3.9M
└ TON-bmTON (bmTON): 2.4% | $636.1K
EVAA
├ TON (Main): 0.2% | $2.8M
└ TON (LP): 1.8% | $81.9K
Affluent
├ TON: 0.8% | $1.4M
└ TON-TSTON: 5.4% | $1.2M
KTON
└ TON (KTON): 4.1% | $1.9M
Hipo
└ TON-hTON (hTON): 3.3% | $1.3M
Daolama
├ TON (#1): 15.1% | $514.4K
└ TON (#2): 10.8% | $62.9K
Ston.fi
└ TON-tsTON (tsTON): 0.9% | $163.8K
Snap
└ TON-tsTON (Merkl): 0.0% (+24.7%) | $51.1K
Morpho
├ TON (Re7 TON ): 26.4% | $29.3K
└ TON (SingularV TON Tonstakers): 8.1% | $519
Euler
└ TON: 0.5% | $4.6K
YieldFi
├ yUSD: 9.0% | $31.1M
└ vyUSD: 10.1% | $4.5M
Storm Trade
└ USDT: 9.7% | $6.0M
EVAA
├ USDT (Main): 2.5% | $1.7M
├ USDT (LP): 2.4% | $241.3K
├ USDT (Stable): 1.1% | $185.9K
├ TSUSDE (Main): 0.1% | $78.0K
├ USDT (Alts): 0.5% | $17.2K
├ USDE (Main): 2.1% | $16.0K
└ USDE (Stable): 3.6% | $12.2K
Euler
├ USN: 2.4% | $449.3K
└ USD₮: 15.2% | $1.3K
Affluent
└ USDT: 4.0% | $319.7K
FIVA
├ TSUSDE (For buying PT tsUSDe 30JUN2026): 7.7% | $67.3K
└ TSUSDE (For LP | Maturity 30JUN2026): 6.6% | $61.9K
Snap
└ USDT-USR (Merkl): 0.0% (+21.8%) | $57.1K
Morpho
└ USD₮ (Re7 USDT): 0.4% | $1.9K
Ston.fi
├ USDT-TON (USDT): 4.0% | $5.3M
└ USDT-TON (USDT): 5.8% | $5.2M
DeDust
└ TON-USDT (USDT): 11.1% | $944.9K
Tonco
└ TON-USDT (USDT): 132.5% | $238.3K
BidAsk
└ USDT-TON (USDT): 22.0% | $90.9K
Snap
└ USDT-TON (Merkl): 0.0% (+70.0%) | $42.4K
Snap
└ cbBTC-LBTC (Merkl): 0.0% (+18.8%) | $32.7K`,

  "2026-01-23": `TON Yields Daily
Jan 23, 2026
💎 TON DeFi TVL: $89.0M -$675K (-0.75%) 24h

Tonstakers
└ TON-tsTON (tsTON): 2.9% | $71.4M
Stakee
└ TON (STAKED): 3.1% | $14.0M
Storm Trade
└ TON (TON-SLP): 6.6% | $5.9M
Bemo
├ TON-stTON (stTON): 2.4% | $3.8M
└ TON-bmTON (bmTON): 2.4% | $622.9K
EVAA
├ TON (Main): 0.2% | $2.7M
└ TON (LP): 1.8% | $80.6K
Affluent
├ TON: 0.8% | $1.3M
└ TON-TSTON: 5.3% | $1.1M
KTON
└ TON (KTON): 4.1% | $1.9M
Hipo
└ TON-hTON (hTON): 3.4% | $1.3M
Daolama
├ TON (#1): 11.4% | $501.3K
└ TON (#2): 10.7% | $61.6K
Ston.fi
└ TON-tsTON (tsTON): 1.5% | $160.1K
Snap
└ TON-tsTON (Merkl): 0.0% (+22.9%) | $50.1K
Morpho
├ TON (Re7 TON ): 26.4% | $29.3K
└ TON (SingularV TON Tonstakers): 8.1% | $519
Euler
└ TON: 0.5% | $4.6K
Ethena
└ tsUSDE: 4.5% | $3.8B
YieldFi
├ yUSD: 9.0% | $31.2M
└ vyUSD: 10.1% | $4.5M
Storm Trade
└ USDT: 9.7% | $6.0M
EVAA
├ USDT (Main): 2.5% | $1.7M
├ USDT (LP): 2.4% | $241.3K
├ USDT (Stable): 1.1% | $185.8K
├ TSUSDE (Main): 0.1% | $78.0K
├ USDT (Alts): 0.5% | $17.1K
├ USDE (Main): 2.1% | $16.0K
└ USDE (Stable): 3.6% | $12.2K
Euler
├ USN: 2.4% | $449.3K
└ USD₮: 15.2% | $1.3K
Affluent
└ USDT: 3.6% | $319.7K
FIVA
├ TSUSDE (For buying PT tsUSDe 30JUN2026): 7.7% | $67.4K
└ TSUSDE (For LP | Maturity 30JUN2026): 6.7% | $62.0K
Snap
└ USDT-USR (Merkl): 0.0% (+19.9%) | $57.1K
Morpho
└ USD₮ (Re7 USDT): 0.4% | $1.9K
Ston.fi
├ USDT-TON (USDT): 3.3% | $5.2M
└ USDT-TON (USDT): 5.5% | $5.2M
DeDust
└ TON-USDT (USDT): 8.6% | $943.2K
BidAsk
└ USDT-TON (USDT): 12.6% | $89.5K
Snap
└ USDT-TON (Merkl): 0.0% (+63.7%) | $41.9K
Snap
└ cbBTC-LBTC (Merkl): 0.0% (+17.3%) | $32.5K`,

  "2026-01-24": `TON Yields Daily
Jan 24, 2026
💎 TON DeFi TVL: $88.8M -$171K (-0.19%) 24h

Tonstakers
└ TON-tsTON (tsTON): 3.1% | $71.4M
Stakee
└ TON (STAKED): 3.1% | $14.0M
Storm Trade
└ TON (TON-SLP): 6.6% | $5.9M
Bemo
├ TON-stTON (stTON): 2.4% | $3.8M
└ TON-bmTON (bmTON): 2.4% | $622.5K
EVAA
├ TON (Main): 0.2% | $2.7M
└ TON (LP): 1.8% | $80.5K
Affluent
├ TON: 0.8% | $1.3M
└ TON-TSTON: 5.4% | $1.1M
KTON
└ TON (KTON): 4.1% | $1.9M
Hipo
└ TON-hTON (hTON): 3.4% | $1.3M
Daolama
├ TON (#1): 11.5% | $501.1K
└ TON (#2): 10.8% | $61.6K
Ston.fi
└ TON-tsTON (tsTON): 2.6% | $160.4K
Snap
└ TON-tsTON (Merkl): 0.0% (+22.4%) | $49.8K
Morpho
├ TON (Re7 TON ): 25.2% | $30.2K
└ TON (SingularV TON Tonstakers): 26.1% | $436
Euler
└ TON: 0.5% | $4.6K
Ethena
└ tsUSDE: 4.5% | $3.8B
YieldFi
├ yUSD: 9.0% | $31.2M
└ vyUSD: 10.1% | $4.5M
Storm Trade
└ USDT: 9.7% | $6.0M
EVAA
├ USDT (Main): 2.5% | $1.7M
├ USDT (LP): 2.4% | $240.5K
├ USDT (Stable): 1.1% | $185.7K
├ TSUSDE (Main): 0.1% | $78.0K
├ USDT (Alts): 0.5% | $17.1K
├ USDE (Main): 2.1% | $16.0K
└ USDE (Stable): 3.4% | $12.1K
Affluent
├ TSUSDE-USDT-VAULT7: 3.8% | $1.1M
├ USDT: 4.1% | $311.4K
└ TSUSDE-USDE-USDT: 5.8% | $37.3K
Euler
├ USN: 2.4% | $449.3K
└ USD₮: 15.2% | $1.3K
FIVA
├ TSUSDE (For buying PT tsUSDe 30JUN2026): 7.7% | $67.4K
└ TSUSDE (For LP | Maturity 30JUN2026): 6.7% | $62.0K
Snap
└ USDT-USR (Merkl): 0.0% (+19.3%) | $57.1K
Morpho
└ USD₮ (Re7 USDT): 0.4% | $1.9K
Ston.fi
├ USDT-TON (USDT): 3.7% | $5.2M
└ USDT-TON (USDT): 6.0% | $5.2M
DeDust
└ TON-USDT (USDT): 15.2% | $943.5K
BidAsk
└ USDT-TON (USDT): 6.8% | $89.3K
Snap
└ USDT-TON (Merkl): 0.0% (+61.6%) | $41.9K
Snap
└ cbBTC-LBTC (Merkl): 0.0% (+16.7%) | $32.7K`,
};

console.log("=== Production APY History Backfill ===\n");
console.log("Environment:", Deno.env.get("DENO_DEPLOYMENT_ID") ? "PRODUCTION" : "LOCAL");

const allSnapshots: HistoricalSnapshot[] = [];

for (const [date, message] of Object.entries(messages)) {
  if (message.includes("[Paste")) {
    console.warn(`⚠️  Missing message for ${date}`);
    continue;
  }
  
  const snapshots = parseMessage(message, date);
  allSnapshots.push(...snapshots);
  console.log(`✓ Parsed ${date}: ${snapshots.length} yields`);
}

if (allSnapshots.length === 0) {
  console.error("\n❌ No messages to parse! Please paste historical messages in the script.");
  Deno.exit(1);
}

console.log(`\n📊 Total snapshots: ${allSnapshots.length}`);

await saveSnapshots(allSnapshots);
