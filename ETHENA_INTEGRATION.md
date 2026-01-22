# Ethena Integration

This document explains how Ethena yield opportunities are integrated into the TON Yields Bot.

## Overview

**Ethena** is a synthetic dollar protocol that provides the first crypto-native solution for money not reliant on traditional banking system infrastructure. The protocol offers staked USDe (sUSDE) which earns yield from delta-hedging strategies.

- **Website**: https://app.ethena.fi/earn/ton
- **Telegram Mini App**: https://t.me/ethena_bot
- **Documentation**: https://docs.ethena.fi/

## Supported Token

### tsUSDE (Staked Ethena on TON)
- **Description**: TON-wrapped version of sUSDE (Staked USDe)
- **Strategy**: Delta-hedging of spot ETH positions with short perpetual futures positions
- **Current APY**: ~4.87% (same as sUSDE)
- **Asset Type**: STABLE

## Data Source

### Current Implementation: DefiLlama API

**Status**: ✅ Fully functional

Ethena data is fetched from DefiLlama's yields API, which tracks Ethena pools across all supported chains.

**Data Fetching**:
- **Source**: `https://yields.llama.fi/pools` (filtered by `project: "ethena-usde"`, `symbol: "SUSDE"`)
- **APY**: Taken from DefiLlama (consistent across all chains)
- **TVL**: **Aggregated sum across all chains** where sUSDE is deployed

**Current Data** (as of Jan 23, 2026):
- **tsUSDE (sUSDE)**: 4.87% APY, $3.8B TVL
  - Chains: Ethereum, Base, Arbitrum, etc.

**Why Aggregate TVL?**
Since sUSDE and tsUSDE represent the same underlying asset (staked USDe) with the same APY across all chains, we show the total value locked across all networks. This gives users a complete picture of the protocol's total assets under management.

**tsUSDE vs sUSDE:**
- `sUSDE` = Staked USDe (native on Ethereum and other EVM chains)
- `tsUSDE` = TON-wrapped Staked USDe (bridged to TON blockchain)
- **Same APY**: Both earn the same yield from Ethena's delta-hedging strategy
- **Data Source**: We fetch sUSDE APY from DefiLlama and display it for tsUSDE

## Integration Details

### File Structure

```
src/services/ethena.ts     # Ethena data fetching service
src/services/defillama.ts   # Merges Ethena with other sources
src/services/protocols.ts   # Ethena protocol URL mapping
```

### Data Flow

1. `fetchEthenaYields()` is called from `fetchTonYields()`
2. Fetches sUSDE pools from DefiLlama API
3. Filters for `project: "ethena-usde"` and `symbol: "SUSDE"`
4. Aggregates APY (max) and TVL (sum) across all chains
5. Transforms to `YieldOpportunity` interface with symbol "tsUSDE"
6. Merges with DefiLlama, Merkl, Morpho, Euler, and YieldFi yields

### Classification

- **tsUSDE**: Classified as `STABLE` (stablecoin category)

The token appears in the "STABLECOINS AND RELATED ASSETS" section of the daily message.

## How It Works

### Data Flow

1. **Fetch from DefiLlama**: `fetchEthenaPools()` fetches all pools where `project === "ethena-usde"` and `symbol === "SUSDE"`
2. **Aggregate**: `aggregateEthena()` groups pools
   - Takes the max APY across chains (usually identical)
   - Sums TVL across all chains
3. **Transform**: Convert to `YieldOpportunity` format with symbol "tsUSDE"
4. **Merge**: Integrated with other data sources in `fetchTonYields()`

### Code Example

```typescript
// Fetch Ethena sUSDE pools from DefiLlama
const pools = await fetchEthenaPools();

// Aggregate sUSDE across: Ethereum, Base, Arbitrum, etc.
const aggregated = aggregateEthena(pools);

// Result:
// tsUSDE: APY = 4.87%, TVL = $3.8B (sum of all chains)
```

### Automatic Updates

- **APY**: Updated automatically from DefiLlama (no manual intervention needed)
- **TVL**: Real-time aggregation across all chains
- **New Chains**: Automatically included when Ethena deploys to new networks

## Display Format

### Message Output

```
STABLECOINS AND RELATED ASSETS

Ethena
└ tsUSDE: 4.9% | $3.8B
```

### Sorting

Protocols in the Stablecoins section are sorted by total TVL (descending). Ethena, with $3.8B TVL, appears at the top of the stablecoins category.

## Technical Notes

### Why sUSDE for tsUSDE APY?

1. **Same Underlying Asset**: Both represent staked USDe earning yield from Ethena's protocol
2. **Consistent APY**: The staking yield is protocol-level, not chain-specific
3. **Bridge Mechanics**: tsUSDE is a bridged/wrapped version maintaining the same yield characteristics
4. **User Clarity**: Shows TON users the actual yield they can expect from holding tsUSDE

### Error Handling

- Falls back gracefully if DefiLlama API is unavailable
- Logs errors to console without breaking the bot
- Returns empty array `[]` if no data is available

## Future Enhancements

Potential improvements:
- Direct integration with Ethena's TON-native contract (if available)
- Display of TON-specific TVL for tsUSDE
- Integration of Ethena's USDt (non-staked) yield opportunities
