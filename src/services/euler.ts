import { ethers } from "ethers";
import {
  classifyAsset,
  formatProtocolName,
  getProtocolUrl,
  isCorrelatedPair,
  pairBelongsToCategory,
  isSingleAsset,
  isEthAsset,
} from "./protocols.ts";
import type { YieldOpportunity } from "../types/yields.ts";

// TAC RPC endpoint
const TAC_RPC_URL = "https://rpc.ankr.com/tac";
const NETWORK = "mainnet"; // Using mainnet addresses

// Euler contract addresses for TAC mainnet
const eulerLensAddresses = {
  vaultLens: "0xf5f5eaf1157c0cbbf2F4aa949aaBbD686622EA6f",
};

const eulerPeripheryAddresses = {
  governedPerspective: "0xb5B6AD9d08a2A6556C20AFD1D15796DEF2617e8F",
};

// ABIs (simplified - only the functions we need)
const eulerPerspectiveABI = [
  {
    type: "function",
    name: "verifiedArray",
    inputs: [],
    outputs: [{ name: "", type: "address[]", internalType: "address[]" }],
    stateMutability: "view",
  },
];

const eulerVaultLensABI = [
  {
    type: "function",
    name: "getVaultInfoFull",
    inputs: [{ name: "vault", type: "address", internalType: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct VaultInfoFull",
        components: [
          { name: "timestamp", type: "uint256", internalType: "uint256" },
          { name: "vault", type: "address", internalType: "address" },
          { name: "vaultName", type: "string", internalType: "string" },
          { name: "vaultSymbol", type: "string", internalType: "string" },
          { name: "vaultDecimals", type: "uint256", internalType: "uint256" },
          { name: "asset", type: "address", internalType: "address" },
          { name: "assetName", type: "string", internalType: "string" },
          { name: "assetSymbol", type: "string", internalType: "string" },
          { name: "assetDecimals", type: "uint256", internalType: "uint256" },
          { name: "unitOfAccount", type: "address", internalType: "address" },
          {
            name: "unitOfAccountName",
            type: "string",
            internalType: "string",
          },
          {
            name: "unitOfAccountSymbol",
            type: "string",
            internalType: "string",
          },
          {
            name: "unitOfAccountDecimals",
            type: "uint256",
            internalType: "uint256",
          },
          { name: "totalShares", type: "uint256", internalType: "uint256" },
          { name: "totalCash", type: "uint256", internalType: "uint256" },
          { name: "totalBorrowed", type: "uint256", internalType: "uint256" },
          { name: "totalAssets", type: "uint256", internalType: "uint256" },
          {
            name: "accumulatedFeesShares",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "accumulatedFeesAssets",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "governorFeeReceiver",
            type: "address",
            internalType: "address",
          },
          {
            name: "protocolFeeReceiver",
            type: "address",
            internalType: "address",
          },
          {
            name: "protocolFeeShare",
            type: "uint256",
            internalType: "uint256",
          },
          { name: "interestFee", type: "uint256", internalType: "uint256" },
          {
            name: "hookedOperations",
            type: "uint256",
            internalType: "uint256",
          },
          { name: "configFlags", type: "uint256", internalType: "uint256" },
          { name: "supplyCap", type: "uint256", internalType: "uint256" },
          { name: "borrowCap", type: "uint256", internalType: "uint256" },
          {
            name: "maxLiquidationDiscount",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "liquidationCoolOffTime",
            type: "uint256",
            internalType: "uint256",
          },
          { name: "dToken", type: "address", internalType: "address" },
          { name: "oracle", type: "address", internalType: "address" },
          {
            name: "interestRateModel",
            type: "address",
            internalType: "address",
          },
          { name: "hookTarget", type: "address", internalType: "address" },
          { name: "evc", type: "address", internalType: "address" },
          {
            name: "protocolConfig",
            type: "address",
            internalType: "address",
          },
          {
            name: "balanceTracker",
            type: "address",
            internalType: "address",
          },
          { name: "permit2", type: "address", internalType: "address" },
          { name: "creator", type: "address", internalType: "address" },
          {
            name: "governorAdmin",
            type: "address",
            internalType: "address",
          },
          {
            name: "irmInfo",
            type: "tuple",
            internalType: "struct VaultInterestRateModelInfo",
            components: [
              {
                name: "queryFailure",
                type: "bool",
                internalType: "bool",
              },
              {
                name: "queryFailureReason",
                type: "bytes",
                internalType: "bytes",
              },
              { name: "vault", type: "address", internalType: "address" },
              {
                name: "interestRateModel",
                type: "address",
                internalType: "address",
              },
              {
                name: "interestRateInfo",
                type: "tuple[]",
                internalType: "struct InterestRateInfo[]",
                components: [
                  { name: "cash", type: "uint256", internalType: "uint256" },
                  {
                    name: "borrows",
                    type: "uint256",
                    internalType: "uint256",
                  },
                  {
                    name: "borrowSPY",
                    type: "uint256",
                    internalType: "uint256",
                  },
                  {
                    name: "borrowAPY",
                    type: "uint256",
                    internalType: "uint256",
                  },
                  {
                    name: "supplyAPY",
                    type: "uint256",
                    internalType: "uint256",
                  },
                ],
              },
              {
                name: "interestRateModelInfo",
                type: "tuple",
                internalType: "struct InterestRateModelDetailedInfo",
                components: [
                  {
                    name: "interestRateModel",
                    type: "address",
                    internalType: "address",
                  },
                  {
                    name: "interestRateModelType",
                    type: "uint8",
                    internalType: "enum InterestRateModelType",
                  },
                  {
                    name: "interestRateModelParams",
                    type: "bytes",
                    internalType: "bytes",
                  },
                ],
              },
            ],
          },
          {
            name: "collateralLTVInfo",
            type: "tuple[]",
            internalType: "struct LTVInfo[]",
            components: [
              {
                name: "collateral",
                type: "address",
                internalType: "address",
              },
              { name: "borrowLTV", type: "uint256", internalType: "uint256" },
              {
                name: "liquidationLTV",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "initialLiquidationLTV",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "targetTimestamp",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "rampDuration",
                type: "uint256",
                internalType: "uint256",
              },
            ],
          },
          {
            name: "liabilityPriceInfo",
            type: "tuple",
            internalType: "struct AssetPriceInfo",
            components: [
              {
                name: "queryFailure",
                type: "bool",
                internalType: "bool",
              },
              {
                name: "queryFailureReason",
                type: "bytes",
                internalType: "bytes",
              },
              {
                name: "timestamp",
                type: "uint256",
                internalType: "uint256",
              },
              { name: "oracle", type: "address", internalType: "address" },
              { name: "asset", type: "address", internalType: "address" },
              {
                name: "unitOfAccount",
                type: "address",
                internalType: "address",
              },
              {
                name: "amountIn",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "amountOutMid",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "amountOutBid",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "amountOutAsk",
                type: "uint256",
                internalType: "uint256",
              },
            ],
          },
          {
            name: "collateralPriceInfo",
            type: "tuple[]",
            internalType: "struct AssetPriceInfo[]",
            components: [
              {
                name: "queryFailure",
                type: "bool",
                internalType: "bool",
              },
              {
                name: "queryFailureReason",
                type: "bytes",
                internalType: "bytes",
              },
              {
                name: "timestamp",
                type: "uint256",
                internalType: "uint256",
              },
              { name: "oracle", type: "address", internalType: "address" },
              { name: "asset", type: "address", internalType: "address" },
              {
                name: "unitOfAccount",
                type: "address",
                internalType: "address",
              },
              {
                name: "amountIn",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "amountOutMid",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "amountOutBid",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "amountOutAsk",
                type: "uint256",
                internalType: "uint256",
              },
            ],
          },
          {
            name: "oracleInfo",
            type: "tuple",
            internalType: "struct OracleDetailedInfo",
            components: [
              { name: "oracle", type: "address", internalType: "address" },
              { name: "name", type: "string", internalType: "string" },
              {
                name: "oracleInfo",
                type: "bytes",
                internalType: "bytes",
              },
            ],
          },
          {
            name: "backupAssetPriceInfo",
            type: "tuple",
            internalType: "struct AssetPriceInfo",
            components: [
              {
                name: "queryFailure",
                type: "bool",
                internalType: "bool",
              },
              {
                name: "queryFailureReason",
                type: "bytes",
                internalType: "bytes",
              },
              {
                name: "timestamp",
                type: "uint256",
                internalType: "uint256",
              },
              { name: "oracle", type: "address", internalType: "address" },
              { name: "asset", type: "address", internalType: "address" },
              {
                name: "unitOfAccount",
                type: "address",
                internalType: "address",
              },
              {
                name: "amountIn",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "amountOutMid",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "amountOutBid",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "amountOutAsk",
                type: "uint256",
                internalType: "uint256",
              },
            ],
          },
          {
            name: "backupAssetOracleInfo",
            type: "tuple",
            internalType: "struct OracleDetailedInfo",
            components: [
              { name: "oracle", type: "address", internalType: "address" },
              { name: "name", type: "string", internalType: "string" },
              {
                name: "oracleInfo",
                type: "bytes",
                internalType: "bytes",
              },
            ],
          },
        ],
      },
    ],
    stateMutability: "view",
  },
];

// Helper to estimate TVL from token balance
function estimateTVL(
  balance: string,
  decimals: number,
): number {
  try {
    const balanceBigInt = BigInt(balance);
    const formatted = Number(ethers.formatUnits(balanceBigInt, decimals));
    // Since we don't have USD prices, just return the token amount
    // This is a proxy - not accurate USD value
    return formatted;
  } catch {
    return 0;
  }
}

// Convert bigint APY (25 decimals) to percentage
function formatSupplyAPY(supplyAPY: bigint): number {
  try {
    // supplyAPY is already in percentage with 25 decimals
    // e.g., 8100000000000000000000000 = 8.1%
    const formatted = ethers.formatUnits(supplyAPY, 25);
    return parseFloat(formatted);
  } catch {
    return 0;
  }
}

// Extract asset symbol from vault data
function extractAssetSymbol(assetSymbol: string): string {
  // Clean up asset symbol
  return assetSymbol.trim();
}

// Transform Euler vault to YieldOpportunity
function transformEulerVault(vault: any): YieldOpportunity | null {
  try {
    // Extract interest rate info
    const irmInfo = vault.irmInfo;
    
    // Check if irmInfo is valid
    if (!irmInfo || !irmInfo.interestRateInfo) {
      return null;
    }

    // interestRateInfo can be either an array or an object
    let rateInfo;
    if (Array.isArray(irmInfo.interestRateInfo)) {
      // Array format - get first element
      if (irmInfo.interestRateInfo.length === 0) {
        return null;
      }
      rateInfo = irmInfo.interestRateInfo[0];
    } else if (typeof irmInfo.interestRateInfo === 'object') {
      // Object format - use directly
      rateInfo = irmInfo.interestRateInfo;
    } else {
      return null;
    }
    
    // Check for the fallback structure with underscore
    let supplyAPY: bigint;
    if (rateInfo && typeof rateInfo === 'object' && '_' in rateInfo && rateInfo._ && typeof rateInfo._.supplyAPY !== 'undefined') {
      supplyAPY = BigInt(rateInfo._.supplyAPY);
    } else if (rateInfo && typeof rateInfo.supplyAPY !== 'undefined') {
      supplyAPY = BigInt(rateInfo.supplyAPY);
    } else {
      // No valid supplyAPY found
      return null;
    }

    const apy = formatSupplyAPY(supplyAPY);

    // Filter low APYs
    if (apy < 0.1) {
      return null;
    }

    // Extract asset symbol
    const asset = extractAssetSymbol(vault.assetSymbol);

    // Skip ETH assets
    if (isEthAsset(asset)) {
      return null;
    }

    // Skip test tokens
    const testTokens = ["BMW", "LADA", "unknown"];
    if (
      testTokens.some((test) =>
        asset.toUpperCase().includes(test.toUpperCase())
      )
    ) {
      return null;
    }

    // Classify asset type
    const assetType = classifyAsset(asset);

    // Estimate TVL (not accurate USD, just token amount)
    const tvlProxy = estimateTVL(
      vault.totalAssets.toString(),
      Number(vault.assetDecimals),
    );

    // Filter low TVL
    if (tvlProxy < 10) {
      return null;
    }

    return {
      assetType,
      source: "Euler",
      sourceUrl: getProtocolUrl("euler"),
      asset,
      poolMeta: null,
      apyBase: apy,
      apyReward: null,
      apyTotal: apy,
      tvlUsd: tvlProxy,
    };
  } catch (error) {
    console.error(
      `Error transforming Euler vault ${vault.vaultSymbol}:`,
      error,
    );
    return null;
  }
}

// Filter correlated yields
function filterCorrelatedEulerYields(
  pools: YieldOpportunity[],
): YieldOpportunity[] {
  return pools.filter((pool) => {
    if (isSingleAsset(pool.asset)) return true;
    return (
      pairBelongsToCategory(pool.asset, pool.assetType) &&
      isCorrelatedPair(pool.asset, pool.assetType)
    );
  });
}

// Main function to fetch Euler yields
export async function fetchEulerYields(): Promise<YieldOpportunity[]> {
  console.log("Fetching yields from Euler contracts (TAC chain)...");

  try {
    // Create provider
    const provider = new ethers.JsonRpcProvider(TAC_RPC_URL);

    // Create contract instances
    const governedPerspectiveContract = new ethers.Contract(
      eulerPeripheryAddresses.governedPerspective,
      eulerPerspectiveABI,
      provider,
    );

    const vaultLensContract = new ethers.Contract(
      eulerLensAddresses.vaultLens,
      eulerVaultLensABI,
      provider,
    );

    // Get verified vaults
    console.log("Fetching verified vaults from Euler...");
    const verifiedVaults = (await governedPerspectiveContract.verifiedArray()) as string[];
    console.log(`Found ${verifiedVaults.length} verified Euler vaults`);

    // Fetch vault info in batches of 5
    const batchSize = 5;
    const allYields: YieldOpportunity[] = [];

    for (let i = 0; i < verifiedVaults.length; i += batchSize) {
      const batch = verifiedVaults.slice(i, i + batchSize);
      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(verifiedVaults.length / batchSize)}...`,
      );

      const batchPromises = batch.map(async (vaultAddress) => {
        try {
          const vaultInfo = await vaultLensContract.getVaultInfoFull(
            vaultAddress,
          );
          
          // Convert to plain object using toObject if available
          let vaultData;
          if (typeof vaultInfo.toObject === 'function') {
            vaultData = vaultInfo.toObject({ deep: true });
          } else {
            vaultData = vaultInfo;
          }

          return transformEulerVault(vaultData);
        } catch (error) {
          console.error(
            `Error fetching vault ${vaultAddress}:`,
            error,
          );
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      const validYields = batchResults.filter(
        (y): y is YieldOpportunity => y !== null,
      );
      allYields.push(...validYields);

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < verifiedVaults.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(`${allYields.length} Euler yields after transformation`);

    // Apply correlation filter
    const correlatedYields = filterCorrelatedEulerYields(allYields);
    console.log(
      `${correlatedYields.length} Euler yields after correlation filter`,
    );

    return correlatedYields;
  } catch (error) {
    console.error("Failed to fetch Euler yields:", error);
    return [];
  }
}
