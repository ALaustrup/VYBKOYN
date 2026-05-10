import { Router } from "express";

/**
 * Public claim deployment metadata for wallets / UI (no secrets).
 */
export const claimRouter = Router();

claimRouter.get("/info", (_req, res) => {
  const chainId = Number(process.env.CHAIN_ID ?? "8453");
  const distributor = process.env.KOYN_MERKLE_DISTRIBUTOR?.trim() || null;
  const token = process.env.KOYN_TOKEN_ADDRESS?.trim() || null;
  const explorer =
    chainId === 8453
      ? "https://basescan.org"
      : chainId === 1
        ? "https://etherscan.io"
        : null;

  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({
    chainId,
    merkleDistributor: distributor,
    koynToken: token,
    blockExplorer: explorer,
    leafEncoding:
      "OpenZeppelin StandardMerkleTree: keccak256(bytes.concat(keccak256(abi.encode(address, cumulativeAmountWei))))",
    tooling: "@openzeppelin/merkle-tree — see server/scripts/build-claim-merkle.ts",
    alpha: process.env.ALPHA_PUBLIC === "1",
  });
});
