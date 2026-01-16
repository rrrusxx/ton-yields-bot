/**
 * TON TVL History Tracker
 * Stores daily TVL snapshots to calculate 24h changes
 */

interface TvlSnapshot {
  date: string; // ISO date string (YYYY-MM-DD)
  tvl: number;
  timestamp: number;
}

interface TvlHistory {
  snapshots: TvlSnapshot[];
}

const HISTORY_FILE = "./data/tvl_history.json";
const MAX_HISTORY_DAYS = 30; // Keep last 30 days

/**
 * Ensure data directory exists
 */
async function ensureDataDir(): Promise<void> {
  try {
    await Deno.mkdir("./data", { recursive: true });
  } catch (error) {
    // Directory already exists
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }
}

/**
 * Load TVL history from file
 */
async function loadHistory(): Promise<TvlHistory> {
  try {
    const data = await Deno.readTextFile(HISTORY_FILE);
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet
    if (error instanceof Deno.errors.NotFound) {
      return { snapshots: [] };
    }
    console.error("Failed to load TVL history:", error);
    return { snapshots: [] };
  }
}

/**
 * Save TVL history to file
 */
async function saveHistory(history: TvlHistory): Promise<void> {
  await ensureDataDir();
  await Deno.writeTextFile(HISTORY_FILE, JSON.stringify(history, null, 2));
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
    console.log(`TVL snapshot saved: ${today} = $${(tvl / 1000000).toFixed(2)}M`);
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
