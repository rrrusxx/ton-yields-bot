# Production APY History Backfill Instructions

## Issue
The 7-day average feature code was deployed to production, but the production Deno KV database is empty. Historical data (Jan 20-24) needs to be added.

## Solution
Run the backfill script **once** in production to populate the cloud KV.

---

## Option 1: Via Deno Deploy Deployctl (Recommended)

1. **Install deployctl** (if not already installed):
```bash
deno install --allow-all --no-check -r -f https://deno.land/x/deploy/deployctl.ts
```

2. **Run the backfill script in production**:
```bash
deployctl run --project=ton-yields-bot \
  --env=TELEGRAM_BOT_TOKEN=<your-token> \
  --env=TELEGRAM_CHANNEL=@ton_yields_daily \
  backfill_production_apy.ts
```

Replace `ton-yields-bot` with your actual Deno Deploy project name.

---

## Option 2: Via Deno Deploy Dashboard

1. Go to your Deno Deploy project dashboard
2. Click on **"Playgrounds"** or **"Create Playground"**
3. Copy the entire contents of `backfill_production_apy.ts`
4. Paste into the playground editor
5. Click **"Save & Deploy"**
6. Check the logs - you should see:
   ```
   ✓ Parsed 2026-01-20: XX yields
   ✓ Parsed 2026-01-21: XX yields
   ...
   ✅ Backfill complete! XX pools saved to production KV.
   ```

---

## Option 3: Temporary Deployment (Simplest)

1. **Create a temporary deployment file** `tmp_backfill.ts`:
```typescript
// Import and run the backfill
import "./backfill_production_apy.ts";
```

2. **Deploy temporarily**:
```bash
deployctl deploy --project=ton-yields-bot tmp_backfill.ts
```

3. **Wait for completion** (check logs in dashboard)

4. **Revert deployment** back to main bot

---

## Verification

After running the backfill, check tomorrow's message (Jan 25) to confirm 7-day averages are showing.

Expected format:
- Regular pools: `9.0% (7d: 9.3%)`
- Reward pools: `0.0% (+22.4%), 7d: 22.8%`

Pools should have 5 days of history and show averages (minimum 3 days required).

---

## Important Notes

- **Run this script ONLY ONCE** in production
- The script is idempotent (safe to run multiple times, won't create duplicates)
- After backfill, daily messages will automatically save new APY snapshots
- Historical data persists in cloud KV (survives deployments)
- Local KV (`./data/kv.db`) is separate from production cloud KV

---

## Troubleshooting

**Q: Script runs but no output?**
- Check Deno Deploy logs in the dashboard
- Ensure `--unstable-kv` and `--allow-env` flags are present

**Q: Still no 7-day averages after backfill?**
- Wait for next daily message (9:00 UTC)
- Check that the main bot code was deployed (commit b313d11 or later)
- Run `git log origin/main -1` to verify latest commit on GitHub

**Q: How do I check if backfill worked?**
- The script outputs "✅ Backfill complete!" with pool count
- Tomorrow's message should show averages
- Cloud KV is not directly queryable (no UI), trust the script output

---

## After Backfill

Once backfill is complete:
1. ✅ Delete `backfill_production_apy.ts` from the repo (no longer needed)
2. ✅ Delete this instruction file
3. ✅ Wait for tomorrow's message to verify 7-day averages appear
