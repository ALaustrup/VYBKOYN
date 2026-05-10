/**
 * Build an OpenZeppelin Standard Merkle tree for KoynMerkleDistributor.
 *
 * Usage:
 *   npx tsx scripts/build-claim-merkle.ts ./scripts/sample-allocations.json [output-dir]
 *
 * Input JSON: either `[{ "address", "cumulativeWei" }, ...]` or `{ "allocations": [...] }`.
 * `cumulativeWei` is total claim entitlement per account (wei as decimal string).
 *
 * Outputs (default ./merkle-out): claim-batch.json (root + proofs), merkle-tree-dump.json (reloadable).
 */
import fs from "node:fs";
import path from "node:path";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { getAddress } from "viem";

type Row = { address: string; cumulativeWei: string };

function loadRows(filePath: string): Row[] {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Row[] | { allocations: Row[] };
  const list = Array.isArray(raw) ? raw : raw.allocations;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("Expected non-empty allocations array");
  }
  return list.map((r) => ({
    address: getAddress(r.address as `0x${string}`),
    cumulativeWei: String(r.cumulativeWei).trim(),
  }));
}

function main() {
  const inFile = process.argv[2] ?? process.env.ALLOCATIONS_FILE;
  const outDir = process.argv[3] ?? process.env.MERKLE_OUT_DIR ?? path.join(process.cwd(), "merkle-out");

  if (!inFile) {
    console.error("Usage: npx tsx scripts/build-claim-merkle.ts <allocations.json> [output-dir]");
    process.exit(1);
  }

  const rows = loadRows(inFile);
  const values: [string, string][] = rows.map((r) => [r.address, r.cumulativeWei]);
  const tree = StandardMerkleTree.of(values, ["address", "uint256"]);

  fs.mkdirSync(outDir, { recursive: true });

  const leaves: { address: string; cumulativeWei: string; proof: string[] }[] = [];
  for (const [, value] of tree.entries()) {
    const proof = tree.getProof(value);
    leaves.push({
      address: value[0] as string,
      cumulativeWei: value[1] as string,
      proof,
    });
  }

  const batch = {
    root: tree.root,
    leafEncoding: ["address", "uint256"] as const,
    leafDescription:
      "Matches KoynMerkleDistributor: keccak256(bytes.concat(keccak256(abi.encode(account, cumulativeAmount))))",
    leaves,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(outDir, "claim-batch.json"), JSON.stringify(batch, null, 2));
  fs.writeFileSync(path.join(outDir, "merkle-tree-dump.json"), JSON.stringify(tree.dump(), null, 2));

  console.log("Merkle root:", tree.root);
  console.log("Leaves:", leaves.length);
  console.log("Written to:", path.resolve(outDir));
}

main();
