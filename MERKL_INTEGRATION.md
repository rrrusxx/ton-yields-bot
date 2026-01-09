# Merkl API Integration

## Overview

This bot now integrates with [Merkl](https://app.merkl.xyz/?chain=239) to fetch additional yield opportunities from TAC (The Application Chain) - Chain ID 239.

## Data Sources

### DefiLlama
- TON native protocols
- Traditional DeFi on TON blockchain
- Focus: TON, stablecoins, BTC on TON

### Merkl
- TAC dApp yields (Curve, Morpho, Euler, Carbon, Snap)
- EVM protocol rewards on TON
- Liquidity mining campaigns

## TAC dApps Supported

| Protocol | Type | Link |
|----------|------|------|
| **Curve** | DEX | [t.me/CurveAppBot](https://t.me/CurveAppBot) |
| **Morpho** | Lending | [t.me/MorphoOrgBot](https://t.me/MorphoOrgBot) |
| **Euler** | Lending | [t.me/EulerFinanceBot](https://t.me/EulerFinanceBot) |
| **Carbon** | DEX | [t.me/CarbonDefiAppBot](https://t.me/CarbonDefiAppBot) |
| **Snap** | DEX | [snap.club](https://www.snap.club/) |

## API Details

**Endpoint:** `https://api.merkl.xyz/v4/opportunities?chainId=239`

**Response Structure:**
```typescript
interface MerklOpportunity {
  name: string;          // Pool name
  identifier: string;    // Unique ID
  apr: number;          // APR percentage
  tvl: number;          // TVL in USD
  chainId: number;      // 239 for TAC
  protocol: {
    name: string;       // Protocol name
  }
}
```

## APR to APY Conversion

Merkl provides APR (Annual Percentage Rate), which we convert to APY (Annual Percentage Yield) using daily compounding:

```
APY = (1 + APR/365)^365 - 1
```

## Data Merging

1. Fetch DefiLlama yields (TON native)
2. Fetch Merkl yields (TAC dApps)
3. Merge both sources
4. No deduplication needed (different chains/protocols)
5. Sort by TVL within each category

## Testing

```bash
# Test mode (no Telegram)
deno task dev

# Post to channel
deno task post
```

## Troubleshooting

If Merkl API fails:
- Bot continues with DefiLlama data only
- Error logged to console
- No disruption to normal operation
