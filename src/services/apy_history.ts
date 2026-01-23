/**
 * APY History Tracker
 * Stores daily APY snapshots to calculate 7-day averages
 * Uses Deno KV for persistent storage across deployments
 */

import type { YieldOpportunity } from "../types/yields.ts";

interface ApySnapshot {
  date: string; // ISO date string (YYYY-MM-DD)
  apy: number;
  timestamp: number;
}

interface PoolHistory {
  poolId: string;
  snapshots: ApySnapshot[];
}

const KV_PREFIX = ["apy_history"];
const MAX_HISTORY_DAYS = 30; // Keep last 30 days
const MIN_DAYS_FOR_AVERAGE = 3; // Minimum days needed to show average

/**
 * Open Deno KV database
 * In production (Deno Deploy): uses cloud KV (no path needed)
 * In development: uses local file in ./data/kv.db
 */
async function getKv(): Promise<Deno.Kv> {
  // Check if we're in Deno Deploy production environment
  const isProduction = Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined;
  
  if (isProduction) {
    // Production: Use cloud KV (default)
    return await Deno.openKv();
  } else {
    // Development: Use local file-based KV
    try {
      await Deno.mkdir("./data", { recursive: true });
    } catch {
      // Directory already exists
    }
    return await Deno.openKv("./data/kv.db");
  }
}

/**
 * Generate a unique pool ID from YieldOpportunity
 * Format: "source-asset-poolMeta"
 * Example: "EVAA-USDT-Main", "Stonfi-TON-tsTON-tsTON"
 */
function generatePoolId(pool: YieldOpportunity): string {
  const source = pool.source.replace(/[^a-zA-Z0-9]/g, "");
  const asset = pool.asset.replace(/[^a-zA-Z0-9]/g, "");
  const meta = pool.poolMeta ? pool.poolMeta.replace(/[^a-zA-Z0-9]/g, "") : "default";
  return `${source}-${asset}-${meta}`.toLowerCase();
}

/**
 * Get today's date as ISO string (YYYY-MM-DD)
 */
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

/**
 * Load pool history from Deno KV
 */
async function loadPoolHistory(poolId: string): Promise<PoolHistory> {
  try {
    const kv = await getKv();
    const key = [...KV_PREFIX, poolId];
    const result = await kv.get<PoolHistory>(key);
    kv.close();
    
    if (result.value) {
      return result.value;
    }
    
    return { poolId, snapshots: [] };
  } catch (error) {
    console.error(`Failed to load APY history for ${poolId}:`, error);
    return { poolId, snapshots: [] };
  }
}

/**
 * Save pool history to Deno KV
 */
async function savePoolHistory(history: PoolHistory): Promise<void> {
  try {
    const kv = await getKv();
    const key = [...KV_PREFIX, history.poolId];
    await kv.set(key, history);
    kv.close();
  } catch (error) {
    console.error(`Failed to save APY history for ${history.poolId}:`, error);
  }
}

/**
 * Save today's APY snapshot for a pool
 */
export async function saveApySnapshot(pool: YieldOpportunity): Promise<void> {
  try {
    const poolId = generatePoolId(pool);
    const history = await loadPoolHistory(poolId);
    const today = getTodayDate();
    
    // Check if we already have a snapshot for today
    const existingIndex = history.snapshots.findIndex(s => s.date === today);
    
    const snapshot: ApySnapshot = {
      date: today,
      apy: pool.apyTotal,
      timestamp: Date.now(),
    };
    
    if (existingIndex >= 0) {
      // Update existing snapshot
      history.snapshots[existingIndex] = snapshot;
    } else {
      // Add new snapshot
      history.snapshots.push(snapshot);
    }
    
    // Sort by date (newest first)
    history.snapshots.sort((a, b) => b.date.localeCompare(a.date));
    
    // Keep only last N days
    history.snapshots = history.snapshots.slice(0, MAX_HISTORY_DAYS);
    
    await savePoolHistory(history);
  } catch (error) {
    // Silent fail - don't break message generation
  }
}

/**
 * Calculate 7-day average APY for a pool
 * Returns average APY or null if not enough history
 */
export async function calculate7DayAverage(pool: YieldOpportunity): Promise<number | null> {
  try {
    const poolId = generatePoolId(pool);
    const history = await loadPoolHistory(poolId);
    
    if (history.snapshots.length < MIN_DAYS_FOR_AVERAGE) {
      return null;
    }
    
    // Get last 7 days of snapshots
    const last7Days = history.snapshots.slice(0, 7);
    
    // Calculate average
    const sum = last7Days.reduce((acc, snap) => acc + snap.apy, 0);
    const average = sum / last7Days.length;
    
    return average;
  } catch (error) {
    return null;
  }
}

/**
 * Save APY snapshots for all pools
 * Called once per day during message generation
 */
export async function saveAllApySnapshots(pools: YieldOpportunity[]): Promise<void> {
  try {
    console.log(`Saving APY snapshots for ${pools.length} pools...`);
    
    // Save in batches to avoid overwhelming KV
    const batchSize = 50;
    for (let i = 0; i < pools.length; i += batchSize) {
      const batch = pools.slice(i, i + batchSize);
      await Promise.all(batch.map(pool => saveApySnapshot(pool)));
    }
    
    console.log(`✓ APY snapshots saved`);
  } catch (error) {
    console.error("Failed to save APY snapshots:", error);
  }
}

/**
 * Calculate 7-day averages for all pools
 * Returns a Map of pool -> 7-day average
 */
export async function calculateAll7DayAverages(pools: YieldOpportunity[]): Promise<Map<YieldOpportunity, number>> {
  const averages = new Map<YieldOpportunity, number>();
  
  try {
    // Calculate in batches for performance
    const batchSize = 50;
    for (let i = 0; i < pools.length; i += batchSize) {
      const batch = pools.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async pool => {
          const avg = await calculate7DayAverage(pool);
          return { pool, avg };
        })
      );
      
      for (const { pool, avg } of results) {
        if (avg !== null) {
          averages.set(pool, avg);
        }
      }
    }
    
    console.log(`✓ Calculated 7-day averages for ${averages.size}/${pools.length} pools`);
  } catch (error) {
    console.error("Failed to calculate 7-day averages:", error);
  }
  
  return averages;
}
