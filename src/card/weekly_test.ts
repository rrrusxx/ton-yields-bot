import { assert, assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import type { YieldOpportunity } from "../types/yields.ts";
import type { DigestData } from "../formatters/message.ts";
import { cardCaption, isCardDay, sevenDayApy, weekLabel, weeklyCardData } from "./weekly.ts";

function row(overrides: Partial<YieldOpportunity>): YieldOpportunity {
  return { assetType: "TON", source: "Hipo", sourceUrl: "", asset: "GRAM", poolMeta: "hGRAM", apyBase: 16, apyReward: null, apyTotal: 16, tvlUsd: 9_000_000, ...overrides };
}

const lst = (source: string, token: string, apy7d: number) => row({ source, poolMeta: token, onChain: true, apy7d, apyTotal: apy7d + 0.3 });

function data(ton: YieldOpportunity[], stable: YieldOpportunity[] = [], averages = new Map<YieldOpportunity, number>()): DigestData {
  return {
    averages,
    shown: [
      ...ton.map((r) => ({ row: r, section: "TON", label: r.poolMeta })),
      ...stable.map((r) => ({ row: r, section: "STABLE", label: r.poolMeta })),
    ],
  } as unknown as DigestData;
}

const STAKING = [lst("Hipo", "hGRAM", 16.6), lst("Stakee", "STAKED", 13.7), lst("KTON", "KTON", 13.3), lst("Tonstakers", "tsTON", 12.0)];

Deno.test("the card goes out on Mondays (UTC) and names the 7 days before the post", () => {
  assert(isCardDay("2026-11-30"));
  assert(!isCardDay("2026-11-27"));
  assertEquals(weekLabel("2026-11-30"), "Nov 23-29, 2026");
  assertEquals(weekLabel("2026-12-07"), "Nov 30 - Dec 6, 2026");
  assertEquals(weekLabel("2027-01-04"), "Dec 28, 2026 - Jan 3, 2027");
  assertEquals(weekLabel("2027-03-01"), "Feb 22-28, 2027");
});

Deno.test("liquid staking rows show their on-chain 7-day APY; hacked protocols stay off the card", () => {
  const hacked = lst("Affluent", "tsTON", 40);
  const card = weeklyCardData(data([...STAKING, hacked, row({ source: "TON Whales", poolMeta: "native staking", apyEstimate: true })]), "2026-11-30", "@ton_yields_daily")!;
  assertEquals(card.subtitle, "Week of Nov 23-29, 2026");
  assertEquals(card.sections[0].rows.map((r) => [r.name, r.detail, r.apy]), [
    ["Hipo", "hGRAM", 16.6],
    ["Stakee", "STAKED", 13.7],
    ["KTON", undefined, 13.3],
    ["Tonstakers", "tsTON", 12.0],
  ]);
  assertEquals(card.footer.handle, "@ton_yields_daily");
});

Deno.test("too few measured staking rows means no card that week", () => {
  assertEquals(weeklyCardData(data(STAKING.slice(0, 2)), "2026-11-30", "@ton_yields_daily"), null);
});

Deno.test("stablecoins are ranked by their 7-day value; spot-only and small pools stay off", () => {
  const evaa = row({ assetType: "STABLE", source: "EVAA", asset: "USDT", poolMeta: "Main", apyTotal: 12, tvlUsd: 560_000 });
  const ethena = row({ assetType: "STABLE", source: "Ethena", asset: "TSUSDE", poolMeta: null, apyTotal: 4.8, tvlUsd: 1_600_000 });
  const storm = row({ assetType: "STABLE", source: "Storm Trade", asset: "USDT", poolMeta: null, apyTotal: 1.1, onChain: true, tvlUsd: 2_100_000 });
  const fresh = row({ assetType: "STABLE", source: "New", asset: "USDT", poolMeta: null, apyTotal: 9, tvlUsd: 300_000 }); // no history yet
  const gtc = row({ assetType: "STABLE", source: "GTC", asset: "USDT vault", poolMeta: null, apyTotal: 28.7, tvlUsd: 36_500 }); // under $100K
  const averages = new Map<YieldOpportunity, number>([[evaa, 2.1], [ethena, 4.9], [gtc, 27]]);
  const card = weeklyCardData(data(STAKING, [evaa, ethena, storm, fresh, gtc], averages), "2026-11-30", "@ton_yields_daily")!;
  assertEquals(card.sections[1].note, "7-day APY, pools with $100K+ TVL");
  assertEquals(card.sections[1].rows.map((r) => [r.name, r.detail, r.apy]), [
    ["Ethena", "tsUSDe", 4.9],
    ["EVAA", "USDT (Main)", 2.1],
    ["Storm Trade", "USDT", 1.1],
  ]);
  assertEquals(sevenDayApy(fresh, averages), null);
  assertEquals(sevenDayApy(storm, averages), 1.1); // the vault's own APY is a 7-day value
});

Deno.test("the caption names the leader and stays well under Telegram's 1,024 characters", () => {
  const card = weeklyCardData(data(STAKING), "2026-11-30", "@ton_yields_test")!;
  const caption = cardCaption(card);
  assertStringIncludes(caption, "week of Nov 23-29, 2026");
  assertStringIncludes(caption, "4 tokens, the highest Hipo hGRAM at 16.6%.");
  assert(caption.length < 400);
  assertEquals(card.footer.handle, "@ton_yields_test");
});
