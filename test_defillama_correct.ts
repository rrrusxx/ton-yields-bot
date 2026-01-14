/**
 * Test DefiLlama API with correct parsing
 */

const response = await fetch("https://yields.llama.fi/pools");
const result = await response.json();

console.log("Response structure:");
console.log("- Keys:", Object.keys(result));
console.log("- Type of result:", typeof result);
console.log("- Is array:", Array.isArray(result));

if (result.data) {
  console.log("\nFound 'data' key");
  console.log("- Type of result.data:", typeof result.data);
  console.log("- Is result.data array:", Array.isArray(result.data));
  if (Array.isArray(result.data)) {
    console.log("- result.data.length:", result.data.length);
    const tonPools = result.data.filter((p: any) => p.chain === "TON");
    console.log("- TON pools:", tonPools.length);
    
    const evaa = tonPools.filter((p: any) => p.project?.toLowerCase().includes("evaa"));
    console.log("- EVAA pools:", evaa.length);
    if (evaa.length > 0) {
      console.log("\nEVAA pools found:");
      for (const pool of evaa) {
        console.log(`  ${pool.symbol}: ${pool.apy?.toFixed(2)}% | $${pool.tvlUsd?.toLocaleString()}`);
      }
    }
  }
} else if (Array.isArray(result)) {
  console.log("\nResult is directly an array");
  console.log("- result.length:", result.length);
  const tonPools = result.filter((p: any) => p.chain === "TON");
  console.log("- TON pools:", tonPools.length);
}
