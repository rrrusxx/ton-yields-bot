# YieldFi Integration

This document explains how YieldFi yield opportunities are integrated into the TON Yields Bot.

## Overview

**YieldFi** is a fully on-chain asset management platform offering yield-indexed products like yUSD and vyUSD. Users deposit funds and receive yield-bearing tokens that earn yield block by block.

- **Website**: https://yield.fi/
- **Telegram Mini App**: https://t.me/yieldfi_bot
- **Documentation**: https://docs.yield.fi/

## Supported Tokens

### yUSD
- **Description**: Yield-bearing stablecoin pegged to USD
- **Strategy**: Diversified, market-neutral strategies (zero-coupon bonds, vault deposits)
- **Current APY**: ~9%
- **Asset Type**: STABLE

### vyUSD  
- **Description**: Enhanced yield version of yUSD (vaulted yUSD)
- **Strategy**: Loops positions across blue-chip DeFi protocols (Pendle, Aave, Morpho, Ethena)
- **Current APY**: ~10%
- **Asset Type**: STABLE

## Data Source

### Current Implementation: DefiLlama API with Cross-Chain Aggregation

**Status**: ✅ Fully functional

YieldFi data is fetched from DefiLlama's yields API, which tracks YieldFi pools across all supported chains.

**Data Fetching**:
- **Source**: `https://yields.llama.fi/pools` (filtered by `project: "yieldfi"`)
- **APY**: Taken from DefiLlama (consistent across all chains)
- **TVL**: **Aggregated sum across all chains** where the token is deployed

**Current Data** (as of Jan 13, 2026):
- **yUSD**: 9.03% APY, $31.67M TVL
  - Chains: Ethereum, Saga, TAC, Base, Arbitrum, Plume, Avalanche, BSC, Optimism
- **vyUSD**: 10.13% APY, $4.48M TVL
  - Chains: Ethereum, Saga, Arbitrum, Base, Plume, Sonic, BSC

**Why Aggregate TVL?**
Since yUSD and vyUSD are the same tokens across all chains (fungible and interoperable), we show the total value locked across all networks. This gives users a complete picture of the protocol's total assets under management.

## Integration Details

### File Structure

```
src/services/yieldfi.ts    # YieldFi data fetching service
src/services/defillama.ts  # Merges YieldFi with other sources
src/services/protocols.ts  # YieldFi protocol URL mapping
```

### Data Flow

1. `fetchYieldFiYields()` is called from `fetchTonYields()`
2. Checks if contract addresses are configured
3. If yes: Queries smart contracts for real data
4. If no: Returns fallback APY data
5. Transforms data to `YieldOpportunity` interface
6. Merges with DefiLlama, Merkl, Morpho, and Euler yields

### Classification

- **yUSD**: Classified as `STABLE` (stablecoin category)
- **vyUSD**: Classified as `STABLE` (yield-bearing stable)

Both tokens appear in the "STABLECOINS AND RELATED ASSETS" section of the daily message.

## How It Works

### Data Flow

1. **Fetch from DefiLlama**: `fetchYieldFiPools()` fetches all pools where `project === "yieldfi"`
2. **Filter Tokens**: Only yUSD and vyUSD pools are processed
3. **Aggregate by Token**: `aggregateYieldFiByToken()` groups pools by symbol
   - Takes the max APY across chains (usually identical)
   - Sums TVL across all chains
4. **Transform**: Convert to `YieldOpportunity` format
5. **Merge**: Integrated with other data sources in `fetchTonYields()`

### Code Example

```typescript
// Fetch YieldFi pools from DefiLlama
const pools = await fetchYieldFiPools();

// Aggregate yUSD across: Ethereum, Base, Arbitrum, TAC, etc.
const aggregated = aggregateYieldFiByToken(pools);

// Result:
// yUSD: APY = 9.03%, TVL = $31.67M (sum of all chains)
// vyUSD: APY = 10.13%, TVL = $4.48M (sum of all chains)
```

### Automatic Updates

- **APY**: Updated automatically from DefiLlama (no manual intervention needed)
- **TVL**: Real-time aggregation across all chains
- **New Chains**: Automatically included when YieldFi deploys to new networks

## Architecture

YieldFi uses the **ERC-4626** tokenized vault standard:

- `totalAssets()`: Total underlying assets in vault
- `totalSupply()`: Total vault tokens issued
- `asset()`: Underlying asset address
- `symbol()`: Token symbol (yUSD, vyUSD)

The integration follows the same pattern as Euler (direct smart contract interaction using ethers.js).

## Testing

```bash
# Test YieldFi integration locally
deno task test-msg

# Check logs for YieldFi output
deno task test-msg 2>&1 | grep -A 5 "YieldFi"

# Deploy to production
git add .
git commit -m "feat: add YieldFi integration"
git push origin main
```

## Notes

- YieldFi APYs are consistent across all chains where they're deployed
- The same yields are available on Ethereum, Arbitrum, Base, and now TAC/TON
- yUSD and vyUSD can be minted 1:1 from USDT on TON
- YieldFi uses Chainlink oracles for price feeds

## References

- [YieldFi Documentation](https://docs.yield.fi/)
- [yUSD Technical Docs](https://docs.yield.fi/technical-docs/ytokens/yusd)
- [YieldFi Architecture](https://docs.yield.fi/technical-docs/architecture)
- [YieldFi Contract Addresses](https://docs.yield.fi/resources/contract-addresses)
- [YieldFi Audits](https://docs.yield.fi/resources/audits)

## Future Enhancements

- [ ] Monitor for new YieldFi vaults (yETH, yBTC, vyETH, vyBTC)
- [ ] Add historical APY tracking
- [ ] Add APY delta (change vs yesterday)
- [ ] Add YieldFi Points information if relevant
- [ ] Consider showing per-chain breakdown in detailed view
