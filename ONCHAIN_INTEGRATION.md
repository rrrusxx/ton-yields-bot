# On-chain Integration

Since v1.5.0 the bot reads the yield of the six liquid staking tokens (LSTs) straight from their contracts instead of taking it from aggregators. Code: `src/services/onchain.ts`.

## Method

Every LST contract holds GRAM and has issued tokens. Their ratio, the exchange rate, only grows when stakers are paid, after the protocol's commission:

```
rate = GRAM held by the contract / LST tokens issued
APY  = (rate_now / rate_then) ^ (one year / window) - 1
```

The result is the yield holders actually received, net of every protocol fee.

`rate_then` comes from the same contract at an older masterchain block: toncenter v2 `runGetMethod` with a `seqno`, which archival liteservers answer. The bot needs no history of its own.

### Windows

Pools pay every validation round (Tonstakers, Stakee, Hipo) or every other round (KTON, Bemo). Both windows are whole cycles of 2 rounds (1 cycle = 2 x 65,536 s), so each one normally holds the same number of payouts whatever the time of day.

| Shown in the post | Window | Length |
|---|---|---|
| APY | the last cycle | 131,072 s, about 1.5 days |
| "7d" value | the last 5 cycles | 655,360 s, about 7.6 days |

The "7d" value of an on-chain row is measured directly (`apy7d`), not averaged from saved daily snapshots, so it never mixes in figures from other sources. On-chain rows also do not write into the saved 7-day history, which stays for the fallback rows. Sampled on 2026-11-20 at 8 times over 37 hours, the one-cycle APY stayed within 0.3 pp for every LST.

### When a window miscounts payouts

KTON and Bemo payouts drift up to about 13 minutes around the cycle, so about 0.3% of the time a window ends between a payout and its usual time and counts one payout too many or too few. A one-cycle window then shows roughly double or zero (for example KTON 28.5% instead of 13.4%, replayed for 2026-11-17 22:11 UTC); a 5-cycle window moves by 10-20%. `reconcile()` compares the two readings:

| Gap between the one-cycle and 5-cycle APY | Post shows |
|---|---|
| up to 8% (relative) | APY = one cycle, 7d = 5 cycles |
| 8-35% | APY = one cycle, no 7d value (the week may be off by a payout) |
| over 35% | APY and 7d = 5 cycles (the cycle counted a payout too many or too few) |
| no 5-cycle reading | the LST falls back for the day (nothing vouches for the one-cycle value) |
| no one-cycle reading | APY and 7d = 5 cycles |

Normal gaps on 2026-11-20 were 0.1-1.6%. This catches a miscount at the start of the one-cycle window. A miscount at "now", the end both windows share, moves both readings together and is not caught: about 0.1% of runs per KTON or Bemo token, with a value off by about 20%. Aligning both windows to the start of a validation round would remove the edge effect entirely; it is the planned next improvement.

## Contracts

| Row in the post | Contract | Get-method | Rate |
|---|---|---|---|
| Tonstakers GRAM-tsTON (tsTON) | `EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR` | `get_pool_full_data` (30 values) | [2] / [13] |
| Stakee GRAM (STAKED) | `EQD2_4d91M4TVbEBVyBF8J1UwpMJc361LKVCz6bBlffMW05o` | `get_pool_full_data` (30 values) | [2] / [13] |
| Hipo GRAM-hGRAM (hGRAM) | `EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ` | `get_treasury_state` | [0] / [1] |
| KTON GRAM (KTON) | `EQA9HwEZD_tONfVz6lJS0PVKR5viEiEGyj9AuQewGQVnXPg0` | `get_pool_full_data` (34 values) | [2] / [17] |
| Bemo GRAM-stTON (stTON, v1) | `EQDNhy-nxYFgUqzfUzImBEP67JqsyMIcyk2S5_RwNNEYku0k` | `get_full_data` | [1] / [0] |
| Bemo GRAM-bmTON (bmTON, v2) | `EQCSxGZPHqa3TtnODgMan8CEM0jf6HpY-uon_NMeFgjKqkEY` | `get_full_data` | [1] / [0] |

The rows keep the same protocol name, asset and label as the Swap.coffee rows they replace.

## TVL

TVL = GRAM held by the contract now x the GRAM price (`src/services/prices.ts`). Without a price the row keeps its APY and shows no TVL.

## Safety and fallbacks

- **Fail closed.** An unknown get-method layout rejects the reading: `get_pool_full_data` must return 30 or 34 values, Bemo `get_full_data` exactly 15, Hipo `get_treasury_state` at least 31 (its tuple only grows). A rate that did not grow or an APY outside 0-40% rejects that window. Each window (block lookup and read) fails on its own; see the table above for how the readings combine. If both windows fail, or the current state cannot be read, that LST is left to the fallback.
- **Time limit.** After 2 minutes every LST falls back and the abandoned run stops at its next request, so a slow toncenter day never delays or loses the post. An archival "cannot load state" answer (HTTP 500 with a LITE_SERVER error) moves at once to a later block (+3, +50, +250), using that block's own time, instead of asking the same block again; block lookups retry a few seconds later, and the current-state read retries once.
- **Fallback.** Swap.coffee still delivers its LST rows, with Palette's APR and TVL overrides. `preferOnchain` replaces only the rows of the LSTs the engine read successfully, matched by contract address or by protocol and ticker in either generation (tsGRAM and tsTON are the same), so a toncenter outage or a ticker rename never shows an LST twice or loses it. The replacement runs after Palette's overrides, so without a GRAM price an on-chain row keeps the replaced row's Palette-corrected TVL.
- **Cross-check.** Palette never overrides an on-chain row. When an on-chain row replaces a fallback row, both APYs are logged, with a warning when they differ by more than 1 pp. On 2026-11-20 Palette was 1.27 pp higher for Tonstakers (it uses tonapi's figure) and within 0.4 pp for the others.
- **Footer.** "⛓️ on-chain" appears in the sources line only when the post contains at least one row read from a contract.

## toncenter limits

Without a key toncenter allows about 1 request per second. A normal run makes 4 block-lookup calls and 18 get-method calls, about 25-30 seconds, in parallel with the other sources; when archival nodes are flaky it takes longer, up to the 2-minute limit. A free key (Telegram bot @tonapibot) raises the limit to 10 requests per second. The workflow passes it as the optional secret `TONCENTER_API_KEY`; without the secret everything still works.

## Not on-chain (yet)

| Source | Why |
|---|---|
| EVAA, Storm Trade vaults, Ethena tsUSDe | Readable from contracts (`getAssetRates`, `get_vault_data`, `getTotalAssets`/`getTotalShares`); planned next |
| DEX pools (Ston.fi, DeDust, Tonco) | Their yield is trading fees, and contracts do not keep a history of trades; the DEX APIs are used |
| GRAM price, header TVL | Not stored on chain |
| GTC | Not checked yet |
