# Ethena Integration

This document explains how the Ethena tsUSDe row is built.

## Overview

**Ethena** is a synthetic dollar protocol. Its staked USDe (sUSDe) earns yield from delta-hedging strategies. On TON the same position is held as **tsUSDe**.

- **Website**: https://app.ethena.fi/earn/ton
- **Documentation**: https://docs.ethena.fi/

## Supported Token

### tsUSDE (staked USDe on TON)
- **Strategy**: delta-hedging of spot positions with short perpetual futures
- **APY**: the sUSDe rate
- **Asset type**: `STABLE` ("STABLECOINS AND RELATED ASSETS" section)

## Data Sources

Both numbers come from DefiLlama.

| Value | Source | Notes |
|---|---|---|
| APY | `https://yields.llama.fi/pools`, `project: "ethena-usde"`, `symbol: "SUSDE"` | The only matching pool is on Ethereum. tsUSDe earns the same rate. If several pools match, the highest APY is used. |
| TVL | `https://api.llama.fi/protocol/ethena-tsusde`, field `currentChainTvls.TON` | DefiLlama's "Ethena tsUSDe" listing, which covers TON only. About $1.87M on 2026-11-19. |

If the TVL request fails, the row keeps its APY, shows no TVL (`tvlHidden`) and cannot enter the TOP-5.

### History

Until v1.4.0 (2026-11-20) the bot summed the TVL of all sUSDe pools in the yields API. That is the Ethereum pool (about $1.2B), so the post showed a TVL about 600 times larger than the real amount on TON, and Ethena was sorted first among stablecoins.

## Integration Details

### Files

```
src/services/ethena.ts      # Ethena APY and TON TVL
src/services/defillama.ts   # fetchTonYields() merges Ethena with the other sources
src/services/protocols.ts   # Ethena protocol URL
```

### Data Flow

1. `fetchTonYields()` calls `fetchEthenaYields()`.
2. `fetchEthenaPools()` and `fetchEthenaTonTvl()` run in parallel.
3. The APY is the highest sUSDe APY found; rows below 0.1% are skipped.
4. `transformEthenaToken()` builds one `YieldOpportunity` with the symbol `tsUSDE`.

## Display Format

```
STABLECOINS AND RELATED ASSETS

Ethena
└ tsUSDE: 5.4% | $1.9M
```

## Error Handling

- A failed APY request returns no Ethena row and does not break the post.
- A failed TVL request hides the TVL only.
- Both requests wait up to 90 s (`config.defiLlamaTimeoutMs`, since v1.6.1). DefiLlama's cache is slow when cold: on 2026-11-24 the yields file took 56 s, and with the old 20 s limit the run lost its Ethena row and the whole post.

## Future Enhancements

- Read the tsUSDe vault on TON directly (`getTotalAssets` / `getTotalShares`) to get the realized APY and TVL on chain.
- Reuse the DefiLlama pools download from `defillama.ts` instead of fetching the 10 MB file a second time.
