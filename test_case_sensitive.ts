/**
 * Test case sensitivity
 */

const response = await fetch("https://yields.llama.fi/pools");
const result = await response.json();
const allPools = result.data;

console.log(`Total pools: ${allPools.length}\n`);

// Try different case variations
const chains = new Set(allPools.map((p: any) => p.chain));
console.log("Unique chains:");
for (const chain of Array.from(chains).sort()) {
  const count = allPools.filter((p: any) => p.chain === chain).length;
  console.log(`  "${chain}": ${count} pools`);
}

// Try uppercase
const tonUpper = allPools.filter((p: any) => p.chain === "TON");
console.log(`\nTON (exact): ${tonUpper.length}`);

// Try with toUpperCase
const tonFiltered = allPools.filter((p: any) => p.chain?.toUpperCase() === "TON");
console.log(`TON (with toUpperCase): ${tonFiltered.length}`);

// Check for EVAA in uppercase TON
if (tonFiltered.length > 0) {
  const evaa = tonFiltered.filter((p: any) => p.project?.toLowerCase().includes("evaa"));
  console.log(`EVAA pools: ${evaa.length}`);
  if (evaa.length > 0) {
    console.log("\nEVAA pools:");
    for (const pool of evaa) {
      console.log(`  ${pool.project} - ${pool.symbol}: ${pool.apy?.toFixed(2)}%`);
    }
  }
}
