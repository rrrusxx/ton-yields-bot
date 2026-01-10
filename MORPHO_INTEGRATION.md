# Morpho Integration Documentation

## Overview

Morpho Protocol integration uses the **Goldsky Subgraph** to fetch **direct lending market data** for the TAC (The Application Chain). This provides accurate supply yields for various assets bridged to TON via TAC.

### ⚠️ Important: Direct Markets Only

We only integrate **direct Morpho Blue markets**, NOT MetaMorpho vaults. Here's why:

**The Problem with Vaults:**
- MetaMorpho vaults allocate to underlying Morpho markets
- Vault-level APYs include **vault-specific fees and rewards**
- Goldsky subgraph only provides **underlying market rates** (e.g., 8.13%)
- Actual vault APYs differ significantly (e.g., 7.15% after fees or 8.73% with rewards)
- Showing vault yields would be **misleading and inaccurate**

**Example:**
| Vault | Goldsky Shows | App Shows | Issue |
|-------|---------------|-----------|-------|
| Re7 TON | 8.13% | 7.15% | ❌ Overestimated |
| SingularV TON | 8.13% | 8.73% | ❌ Underestimated |
| tsTON (direct) | 8.13% | 8.13% | ✅ Accurate |

**Solution:**
Only show direct market yields which are accurate and verifiable.

## Data Source

**Goldsky Subgraph URL:**
```
https://api.goldsky.com/api/public/project_cmb98e0e8apjg01q7eg6u5w6f/subgraphs/morpho-subgraph-prod/1.0.3/gn
```

**Query Type:** GraphQL

**Chain:** TAC (Chain ID 239)

## Architecture

```
┌─────────────────────┐
│ Morpho Goldsky      │
│ Subgraph            │
│ (GraphQL API)       │
└──────────┬──────────┘
           │
           ├── Query Markets
           │   • isActive: true
           │   • inputToken
           │   • rates (LENDER/BORROWER)
           │   • inputTokenBalance
           │
           ▼
┌─────────────────────┐
│ src/services/       │
│ morpho.ts           │
│                     │
│ • Fetch markets     │
│ • Extract APY       │
│ • Filter test tokens│
│ • Apply correlation │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Main Aggregator     │
│ (defillama.ts)      │
│                     │
│ Merge with:         │
│ • DefiLlama         │
│ • Merkl             │
│ • Morpho            │
└─────────────────────┘
```

## GraphQL Query

```graphql
{
  markets(
    first: 100
    where: { isActive: true }
  ) {
    id
    name
    protocol {
      name
    }
    inputToken {
      symbol
      name
      decimals
    }
    rates(first: 10) {
      rate
      side
      type
    }
    inputTokenBalance
    totalValueLockedUSD
    totalDepositBalanceUSD
  }
}
```

## Data Transformation

### Market Structure

Morpho markets follow this naming convention:
```
CollateralAsset / LoanAsset
```

**Examples:**
- `TON / tsTON` - Users supply tsTON, collateralized by TON
- `USD₮ / cbBTC` - Users supply cbBTC, collateralized by USDT
- `WETH / wstETH` - Users supply wstETH, collateralized by WETH

### APY Extraction

1. **Filter for LENDER rates** - We only show supply yields (not borrowing)
2. **Convert rate to percentage** - Rates are stored as decimals (0.08 = 8%)
3. **Skip zero or very low APY** - Min 0.1% threshold

### TVL Estimation

⚠️ **Note:** The Goldsky subgraph returns `totalValueLockedUSD: "0"` for most markets.

**Workaround:**
- Use `inputTokenBalance` (token count in contract)
- Convert using token decimals
- Use as activity proxy, not USD value
- Minimum threshold: 10 tokens

### Filtering

#### Test Tokens (Excluded)
- BMW
- LADA
- unknown

#### Correlated Pairs
Same logic as Merkl and DefiLlama:
- **TON category:** TON-tsTON, TON-stTON ✅
- **TON category:** TON-USDT ❌ (IL risk)
- **Stable category:** USDT-USDC ✅
- **Stable category:** USDT-TON ❌ (IL risk)

## Supported Assets (TAC-Bridged)

### TON & LSTs
- TON
- tsTON (liquid staked TON)

### ETH & LSTs
- WETH (Wrapped ETH)
- wstETH (Lido staked ETH)
- wrsETH (Kelp rsETH)
- pufETH (Puffer ETH)

### BTC
- cbBTC (Coinbase Wrapped BTC)
- LBTC (Lombard BTC)

### Stablecoins
- USD₮ (USDT on TON/TAC)
- yUSD (YieldFi stablecoin)

## Code Example

```typescript
// Fetch Morpho yields
const morphoYields = await fetchMorphoYields();

// Example yield object
{
  assetType: "TON",
  source: "Morpho",
  sourceUrl: "https://t.me/MorphoOrgBot",
  asset: "tsTON",
  poolMeta: "Goldsky",
  apyBase: 8.05,
  apyReward: null,
  apyTotal: 8.05,
  tvlUsd: 17.9 // Note: Token count, not USD
}
```

## Integration Flow

1. **Parallel Fetch** - Morpho is fetched alongside DefiLlama and Merkl
2. **Merge Data** - All yields are merged into a single dataset
3. **Re-sort** - Combined dataset is sorted by TVL
4. **Display** - Morpho yields appear alongside other protocols

## Message Format

Morpho yields are displayed with `(Goldsky)` label:

```
Morpho
├ tsTON (Goldsky): 8.1% | $17.9K
├ wrsETH (Goldsky): 0.3% | $28
└ pufETH (Goldsky): 1.3% | $25
```

## Known Limitations

### TVL Accuracy
- Subgraph returns $0 for TVL fields
- Using token balance as proxy
- Not accurate for value comparison
- Good enough for activity filtering

### Market Coverage
- Only includes active direct markets
- **MetaMorpho vaults intentionally excluded** (APYs are inaccurate due to missing vault fee/reward data)
- Only supply-side yields shown (not borrowing)

### Rate Updates
- Subgraph updates periodically (not real-time)
- APY might be slightly outdated
- Block number can be checked via `_meta` query

## Future Improvements

### Priority
- [ ] Add price oracle integration for accurate TVL in USD
- [ ] Add borrowing APYs (currently only showing supply)
- [ ] Historical rate tracking (7-day average)
- [ ] More direct market coverage as they launch

### Research Needed
- Is there a Morpho API with vault-level APY data for TAC?
- Can we get real-time TVL data in USD?
- Are there other direct markets not in subgraph?

## Troubleshooting

### No markets returned
- Check if subgraph is indexing (query `_meta`)
- Verify `isActive: true` filter
- Try removing filters to see all markets

### Zero APY markets
- Normal if market has no activity
- Filter is set to min 0.1% APY
- Check if rates array is empty

### "Unknown" assets
- Token metadata not indexed yet
- Usually means new or test token
- Filtered out automatically

## Resources

- **Morpho Docs:** https://docs.morpho.org/
- **Morpho TMA:** https://t.me/MorphoOrgBot
- **Goldsky Docs:** https://docs.goldsky.com/
- **TAC Docs:** https://docs.tac.build/

## Related Files

- `src/services/morpho.ts` - Main Morpho service
- `src/services/defillama.ts` - Aggregates all sources
- `src/services/protocols.ts` - Protocol URL mappings
- `MERKL_INTEGRATION.md` - Similar integration pattern

---

**Last Updated:** January 10, 2026  
**Maintainer:** Ruslan Romanov
