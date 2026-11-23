# On-chain Integration

Since v1.5.0 the bot reads the yield of the six liquid staking tokens (LSTs) and of the two Storm Trade vaults straight from their contracts instead of taking it from aggregators. Code: `src/services/onchain.ts`.

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

## Storm Trade vaults

Storm Trade liquidity providers deposit into a vault and hold its SLP tokens. The SLP price is the vault's free balance per SLP token (Storm's docs), and `get_vault_data` returns it as the LP rate, so the same formula applies:

```
rate = free balance / SLP supply        (get_vault_data [3] / [2], also given as [1] with 1e9 = 1)
APY  = (rate_now / rate_7_days_ago) ^ (one year / window) - 1
```

LPs get most of the trading, funding and liquidation fees and take the other side of traders' positions, so fees and traders' losses raise the rate and traders' profits lower it. The APY is what the vault actually paid a depositor, and it can be negative over a bad week (the USDT vault's 7-day APY was below zero in 7% of the hours of the past year). While Storm is paused the rate stays flat, as from 2026-11-12 to 11-15.

The window is the last 7 days, as in DefiLlama's Storm adapter: a single day swings between 0% and hundreds of percent a year on liquidation days. On 2026-11-23 the engine gave 4.81% for the GRAM vault and 1.18% for the USDT vault, the same as DefiLlama (4.81% and 1.17%). For comparison, over 30 days the vaults made 14.9% and 4.9%. Storm's app shows higher figures because it divides the rate gain by the launch price of 1.0 instead of the starting rate and annualises over 360 days without compounding (its "APR 7 days" was 6.12% and 1.56%; Palette carries Storm's one-year APR, 8.77% and 4.03%). No "7d" value is shown, since the APY already covers 7 days.

**In the TOP-5 like any row.** Even over 7 days the GRAM vault's APY jumps after a week of heavy liquidations: 42-64% from 2026-10-24 to 10-30, against a median of 5% over the past year. The owner chose on 2026-11-23 to let the vault rows take part in the TOP-5 anyway, so after such a week a vault can lead it; the number is what LPs really earned that week, not a rate to expect.

| Row in the post | Contract | Get-method | Rate |
|---|---|---|---|
| Storm Trade GRAM (TON-SLP) | `EQDpJnZP89Jyxz3euDaXXFUhwCWtaOeRmiUJTi3jGYgF8fnj` | `get_vault_data` (9 values) | [3] / [2] |
| Storm Trade USDT | `EQAz6ehNfL7_8NI7OVh1Qg46HsuC4kFpK-icfqK9J3Frd6CJ` | `get_vault_data` (9 values) | [3] / [2] |

- **Layout** (Storm's specs and SDKs): [0] the vault's jetton wallet, [1] rate, [2] SLP supply, [3] free balance, [4] locked balance, [5] buffer, [6] stakers' balance, [7] executors' balance, [8] pause flag (missing in older states). Balances are in units of 1e-9 for every vault, USDT too. Storm still calls the coin TON (asset "TON", SLP ticker TON-SLP). Swap.coffee sends the vault as GRAM + TON-SLP at the vault's own address, so its row has the same label and address (a later GRAM-SLP rename would still match through the ticker key).
- **TVL** = free balance x the GRAM price or $1: the LPs' pool, as Storm's app shows it ("Total in vault"). The locked balance is traders' collateral, not LP money, and stays out. On 2026-11-23: 781,947 GRAM (about $774K) and 2,138,609 USDT. Palette and DefiLlama add the locked balance (about $931K and $2.35M); until 2026-11-23 the post took Palette's figure.
- **Left out:** the NOT vault (NOT is on the memecoin list) and the jUSDT, USDe and tgUSD vaults, which Storm has retired.
- **Fail closed:** `get_vault_data` must return 8 or 9 values and its rate must equal free balance / supply; a 7-day APY outside -50% to 100% is treated as a bad read. A vault that cannot be read keeps its Swap.coffee row with Palette's APR, when Swap.coffee sends one. Swap.coffee left Storm out of the posts of 2026-11-17, 18, 20, 21 and 22; the on-chain rows stand in on such days.

## Safety and fallbacks

- **Fail closed.** An unknown get-method layout rejects the reading: `get_pool_full_data` must return 30 or 34 values, Bemo `get_full_data` exactly 15, Hipo `get_treasury_state` at least 31 (its tuple only grows). A rate that did not grow or an APY outside 0-40% rejects that window. Each window (block lookup and read) fails on its own; see the table above for how the readings combine. If both windows fail, or the current state cannot be read, that LST is left to the fallback.
- **Time limit.** The LSTs are read first and the Storm vaults after them, within one 2-minute limit. When it runs out, the part still being read falls back, a finished part is kept, and the abandoned reads stop at their next request, so a slow toncenter day never delays or loses the post. An archival "cannot load state" answer (HTTP 500 with a LITE_SERVER error) moves at once to a later block (+3, +50, +250), using that block's own time, instead of asking the same block again; block lookups retry a few seconds later, and the current-state read retries once.
- **Fallback.** Swap.coffee still delivers its LST and Storm rows, with Palette's APR and TVL overrides. `preferOnchain` replaces only the rows of the pools the engine read successfully, matched by contract address or by protocol and ticker in either generation (tsGRAM and tsTON are the same, so are GRAM-SLP and TON-SLP; the asset stands in for a missing label, as for the Storm USDT vault), and adds on-chain rows that have no fallback row, so a toncenter outage or a ticker rename never shows a pool twice or loses it. The LST and the Storm reads fail on their own: one failing does not drop the other. The replacement runs after Palette's overrides, so without a GRAM price an on-chain row keeps the replaced row's TVL (Palette's for Hipo, Swap.coffee's free balance for the Storm GRAM vault).
- **Cross-check.** Palette never overrides an on-chain row. When an on-chain row replaces a fallback row, both APYs are logged, with a warning when they differ by more than 1 pp. On 2026-11-20 Palette was 1.27 pp higher for Tonstakers (it uses tonapi's figure) and within 0.4 pp for the others. For the Storm vaults Palette carries Storm's one-year APR, so a gap of several points is normal there; it is logged only on days Swap.coffee sends the vault.
- **Footer.** "⛓️ on-chain" appears in the sources line only when the post contains at least one row read from a contract.

## toncenter limits

Without a key toncenter allows about 1 request per second. A normal run makes 6 block-lookup calls and 22 get-method calls (the Storm vaults add 2 and 4), about 30-35 seconds, in parallel with the other sources; when archival nodes are flaky it takes longer, up to the 2-minute limit. A free key (Telegram bot @tonapibot) raises the limit to 10 requests per second. The workflow passes it as the optional secret `TONCENTER_API_KEY` (a repository secret since 2026-11-20); without the secret everything still works.

A wrong key (a typo, a revoked key or a testnet key) is not fatal either. toncenter refuses every request that carries it with HTTP 401 "API key does not exist" (a 403 is treated the same way). The engine then logs one warning, with the key masked, repeats that request without the key and finishes the run at the keyless rate, so the on-chain rows stay in the post. A key with a line break, a space or a non-Latin character in it (left by a paste) is skipped the same way before the first request: the value is trimmed first and may then hold only Latin letters, digits and punctuation, and the warning never shows it. fetch cannot send a line break or a non-Latin character at all, and its error would quote the key. Without this, a wrong key would leave all six LSTs and both Storm vaults to Swap.coffee for the day.

## Not on-chain (yet)

| Source | Why |
|---|---|
| EVAA, Ethena tsUSDe | Readable from contracts (`getAssetRates`, `getTotalAssets`/`getTotalShares`); planned next |
| DEX pools (Ston.fi, DeDust, Tonco) | Their yield is trading fees, and contracts do not keep a history of trades; the DEX APIs are used |
| GRAM price, header TVL | Not stored on chain |
| GTC | Not checked yet |
