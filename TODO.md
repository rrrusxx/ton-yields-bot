# TODO - Quick Task List

> For detailed roadmap, see [ROADMAP.md](ROADMAP.md)

## ✅ Recently Completed

- [x] Morpho Goldsky integration (direct markets only)
- [x] Euler contract integration via ethers.js
- [x] Test Euler integration (3 yields: TON, USDT, cbBTC)
- [x] Push Euler integration to GitHub (commit 98fe4ae)
- [x] Curve integration confirmed (uses Merkl API)
- [x] Carbon DeFi DEX verified (already covered by Merkl, no additional yields)
- [x] Test token filtering (BMW, LADA, unknown)
- [x] ETH asset filtering (wrsETH, pufETH, wstETH)

## 🔥 Immediate (This Week)

- [ ] Deploy Euler update to Deno Deploy
- [ ] Add Tonstakers yields (TON liquid staking)
- [ ] Add Bemo yields (TON liquid staking)
- [ ] Start fetching TON wallet yields:
  - [ ] Telegram Wallet (@wallet)
  - [ ] MyTonWallet (MTW)
  - [ ] Tonkeeper
- [ ] Continue Morpho alignment discussions with team

## 🎯 Next Sprint (Current)

- [ ] Create database with historical yields
- [ ] Add 7-day average APYs
- [ ] Show APY delta vs yesterday
- [ ] Research additional yield sources

## 📅 Next Week

- [ ] Add ETH and TAC asset clusters
- [ ] Expand asset classification beyond TON/STABLE/BTC

## 💭 Ideas to Explore

- [ ] Web dashboard with Fresh
- [ ] User alerts system (APY changes, new opportunities)
- [ ] Wallet integration (track user positions)

## ⏸️ On Hold

- [ ] Swap Coffee API integration (waiting for API key access)

## 📝 Quick Notes

<!-- Add quick notes here -->

---

**Quick Commands:**

```bash
# Test bot locally
deno task dev

# Post to channel now
deno task post

# Send test message
deno task test-msg
```
