# Euler Integration Documentation

## Overview

Euler Protocol integration uses **direct smart contract calls** via ethers.js to fetch lending vault data from the TAC (The Application Chain). This provides real-time, on-chain yield data without relying on external indexers.

## Data Source

**Method:** Direct Smart Contract Calls  
**Library:** ethers.js v6  
**Chain:** TAC (Chain ID 239)  
**RPC Endpoint:** `https://rpc.ankr.com/tac`

## Contract Architecture

### Key Contracts

1. **Governed Perspective Contract**
   - Address: `0xb5B6AD9d08a2A6556C20AFD1D15796DEF2617e8F`
   - Function: `verifiedArray()` - Returns list of verified vault addresses

2. **Vault Lens Contract**
   - Address: `0xf5f5eaf1157c0cbbf2F4aa949aaBbD686622EA6f`
   - Function: `getVaultInfoFull(address vault)` - Returns complete vault information

## Data Flow

```
1. Call governedPerspective.verifiedArray()
   ↓
2. Get list of verified vault addresses
   ↓
3. For each vault (in batches of 5):
   ↓
4. Call vaultLens.getVaultInfoFull(vaultAddress)
   ↓
5. Extract vault info:
   - assetSymbol (e.g., "tsTON", "USDT", "cbBTC")
   - assetDecimals
   - totalAssets (for TVL proxy)
   - irmInfo.interestRateInfo[0].supplyAPY
   ↓
6. Transform to YieldOpportunity
   ↓
7. Filter and classify
```

## APY Extraction

### Supply APY Location

Supply APY is located at:
```typescript
vault.irmInfo.interestRateInfo[0].supplyAPY
```

**Important Notes:**
- `supplyAPY` is a BigInt with **25 decimals** precision
- Already expressed as a percentage (not a fraction)
- Example: `8100000000000000000000000` = 8.1%

### Conversion

```typescript
function formatSupplyAPY(supplyAPY: bigint): number {
  // Use ethers.formatUnits to handle BigInt with 25 decimals
  const formatted = ethers.formatUnits(supplyAPY, 25);
  return parseFloat(formatted);
}
```

### Fallback Structure Handling

Some vaults may have a nested structure issue where `interestRateInfo` needs to be accessed via an underscore property:

```typescript
// Check for fallback structure
let supplyAPY: bigint;
if (rateInfo._ && typeof rateInfo._.supplyAPY !== 'undefined') {
  supplyAPY = BigInt(rateInfo._.supplyAPY);
} else if (typeof rateInfo.supplyAPY !== 'undefined') {
  supplyAPY = BigInt(rateInfo.supplyAPY);
} else {
  return null; // No valid APY found
}
```

## Batch Processing

To avoid rate limiting and ensure reliability:

- **Batch Size:** 5 vaults per batch
- **Delay Between Batches:** 500ms
- **Error Handling:** Continue on individual vault failures

```typescript
const batchSize = 5;
for (let i = 0; i < verifiedVaults.length; i += batchSize) {
  const batch = verifiedVaults.slice(i, i + batchSize);
  
  const batchPromises = batch.map(async (vaultAddress) => {
    try {
      const vaultInfo = await vaultLensContract.getVaultInfoFull(vaultAddress);
      return transformEulerVault(vaultInfo);
    } catch (error) {
      console.error(`Error fetching vault ${vaultAddress}:`, error);
      return null;
    }
  });

  const batchResults = await Promise.all(batchPromises);
  
  // 500ms delay between batches
  await new Promise(resolve => setTimeout(resolve, 500));
}
```

## Filtering

### 1. ETH Asset Filter
Euler on TAC has some ETH-related assets (wrsETH, pufETH, etc.) which should be excluded from TON yields:

```typescript
if (isEthAsset(asset)) {
  return null;
}
```

### 2. Test Token Filter
Filter out test tokens:
```typescript
const testTokens = ["BMW", "LADA", "unknown"];
if (testTokens.some(test => asset.toUpperCase().includes(test.toUpperCase()))) {
  return null;
}
```

### 3. Minimum APY Filter
```typescript
if (apy < 0.1) {
  return null;
}
```

### 4. Minimum TVL Filter
```typescript
if (tvlProxy < 10) {
  return null;
}
```

### 5. Correlated Pairs Filter
Applied like other sources to prevent showing pools with IL risk.

## TVL Handling

**Challenge:** Euler contracts return token balances, not USD values.

**Solution:** Use `totalAssets` as a TVL proxy:

```typescript
function estimateTVL(balance: string, decimals: number): number {
  const balanceBigInt = BigInt(balance);
  const formatted = Number(ethers.formatUnits(balanceBigInt, decimals));
  return formatted; // Token amount, not USD
}
```

**Note:** This is not an accurate USD value but serves as a filter for active markets.

## Assets Covered

Based on current Euler vaults on TAC:

- **TON:** tsTON (liquid staked TON)
- **BTC:** cbBTC, LBTC (bridged Bitcoin)
- **Stablecoins:** USDT, yUSD, etc.

## Comparison with Other Sources

| Source | Method | Update Frequency | Accuracy | Coverage |
|--------|--------|------------------|----------|----------|
| **Euler Contracts** | Direct RPC calls | Real-time | ✅ Exact | Only verified vaults |
| Morpho (Goldsky) | GraphQL subgraph | ~Minutes | ✅ Accurate | Direct markets only |
| Merkl API | REST API | ~Hours | ✅ Accurate | Reward campaigns |
| DefiLlama | REST API | ~Daily | ⚠️ Variable | Broad coverage |

## Advantages of Direct Contract Integration

1. **Real-time data** - No indexer delays
2. **Accuracy** - Direct from source of truth
3. **Reliability** - No third-party API dependencies
4. **Transparency** - Verifiable on-chain

## Limitations

1. **No USD TVL** - Contracts don't provide USD values
2. **RPC dependency** - Requires reliable RPC endpoint
3. **Gas/Rate limits** - Must batch requests
4. **Maintenance** - Contract upgrades require code updates

## Error Handling

```typescript
try {
  const vaultInfo = await vaultLensContract.getVaultInfoFull(vaultAddress);
  return transformEulerVault(vaultInfo);
} catch (error) {
  console.error(`Error fetching vault ${vaultAddress}:`, error);
  return null; // Skip failed vaults
}
```

## Future Improvements

- [ ] Fetch USD prices from oracle for accurate TVL
- [ ] Add support for Euler Earn vaults (aggregated vaults)
- [ ] Implement caching to reduce RPC calls
- [ ] Add historical APY tracking from past blocks

## Resources

- **Euler Docs:** https://docs.euler.finance/
- **Euler Telegram Mini App:** https://t.me/EulerFinanceBot
- **TAC Documentation:** https://docs.tac.build/
- **ethers.js Docs:** https://docs.ethers.org/v6/

---

**Last Updated:** January 12, 2026  
**Integration Version:** v1.2.0
