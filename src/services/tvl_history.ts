/**
 * TON TVL History Tracker
 * Stores daily TVL snapshots to calculate 24h changes
 * Uses Deno KV for persistent storage across deployments
 */

interface TvlSnapshot {
  date: string; // ISO date string (YYYY-MM-DD)
  tvl: number;
  timestamp: number;
}

interface TvlHistory {
  snapshots: TvlSnapshot[];
}

const KV_KEY = ["tvl_history"];
const MAX_HISTORY_DAYS = 30; // Keep last 30 days

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
 * Load TVL history from Deno KV
 */
async function loadHistory(): Promise<TvlHistory> {
  try {
    const kv = await getKv();
    const result = await kv.get<TvlHistory>(KV_KEY);
    kv.close();
    
    if (result.value) {
      return result.value;
    }
    
    return { snapshots: [] };
  } catch (error) {
    console.error("Failed to load TVL history from KV:", error);
    return { snapshots: [] };
  }
}

/**
 * Save TVL history to Deno KV
 */
async function saveHistory(history: TvlHistory): Promise<void> {
  try {
    const kv = await getKv();
    await kv.set(KV_KEY, history);
    kv.close();
  } catch (error) {
    console.error("Failed to save TVL history to KV:", error);
    throw error;
  }
}

/**
 * Get today's date as ISO string (YYYY-MM-DD)
 */
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

/**
 * Get yesterday's date as ISO string (YYYY-MM-DD)
 */
function getYesterdayDate(): string {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return now.toISOString().split("T")[0];
}

/**
 * Save today's TVL snapshot
 */
export async function saveTvlSnapshot(tvl: number): Promise<void> {
  try {
    const history = await loadHistory();
    const today = getTodayDate();
    
    // Check if we already have a snapshot for today
    const existingIndex = history.snapshots.findIndex(s => s.date === today);
    
    const snapshot: TvlSnapshot = {
      date: today,
      tvl,
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
    
    await saveHistory(history);
    console.log(`✓ TVL snapshot saved to KV: ${today} = $${(tvl / 1000000).toFixed(2)}M`);
  } catch (error) {
    console.error("Failed to save TVL snapshot:", error);
  }
}

/**
 * Get yesterday's TVL value
 */
export async function getYesterdayTvl(): Promise<number | null> {
  try {
    const history = await loadHistory();
    const yesterday = getYesterdayDate();
    
    const snapshot = history.snapshots.find(s => s.date === yesterday);
    return snapshot ? snapshot.tvl : null;
  } catch (error) {
    console.error("Failed to get yesterday's TVL:", error);
    return null;
  }
}

/**
 * Calculate TVL change from yesterday
 * Returns { change: number, changePercent: number } or null if no history
 */
export async function calculateTvlChange(currentTvl: number): Promise<{
  change: number;
  changePercent: number;
} | null> {
  const yesterdayTvl = await getYesterdayTvl();
  
  if (yesterdayTvl === null || yesterdayTvl === 0) {
    return null;
  }
  
  const change = currentTvl - yesterdayTvl;
  const changePercent = (change / yesterdayTvl) * 100;
  
  return { change, changePercent };
}

/**
 * Format TVL change for display
 * Examples:
 *   "+$2.1M (+2.2%)"
 *   "-$2.1M (-2.2%)"
 */
export function formatTvlChange(change: number, changePercent: number): string {
  const sign = change >= 0 ? "+" : "-";
  const millions = Math.abs(change) / 1000000;
  
  let amountStr: string;
  if (millions >= 1000) {
    // Format as billions
    amountStr = `${sign}$${(millions / 1000).toFixed(2)}B`;
  } else if (millions >= 1) {
    // Format as millions
    amountStr = `${sign}$${millions.toFixed(1)}M`;
  } else {
    // Format as thousands
    amountStr = `${sign}$${(Math.abs(change) / 1000).toFixed(0)}K`;
  }
  
  const percentStr = `${sign}${Math.abs(changePercent).toFixed(2)}%`;
  
  return `${amountStr} (${percentStr})`;
}
