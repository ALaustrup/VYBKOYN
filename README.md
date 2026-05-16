# VYBKOY (KOYN)

High-fidelity crypto-clicker stack: **Base** mainnet (ERC-20, low fees, EIP-4337 paymaster ecosystem for optional gas abstraction), authoritative **Node.js + PostgreSQL** game server, **Next.js** web client.

## Repository layout

| Path | Purpose |
|------|---------|
| `contracts/` | `KOYN` ERC-20 (OpenZeppelin) |
| `server/` | Click validation, leaderboard, shop state |
| `web/` | Game / Shop / Wallet / Leaderboard tabs |
| `docs/WALLET_ARCHITECTURE.md` | Non-custodial key handling |
| `docs/SECURITY_CHECKLIST.md` | Click abuse + wallet/security review |

## Quick start (Docker — recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose).

```bash
npm run docker:up
```

| Service   | URL |
|-----------|-----|
| Web app   | http://localhost:3000 |
| API       | http://localhost:4000 |
| Postgres  | `localhost:5432` (user `koyn` / pass `koyn_dev` / db `koyn`) |

The API container runs **`prisma db push`** on startup (schema includes `SessionNonceUse`). Logs: `npm run docker:logs`. Stop: `npm run docker:down`.

Optional env overrides: copy `.env.docker.example` → `.env` and wire into `docker-compose.yml` if you customize secrets.

## Quick start (manual)

```bash
cd contracts && npm install && npm run compile
cd ../server && npm install && npm run db:generate && npm run dev
cd ../web && npm install && npm run dev
```

Set `DATABASE_URL` and `JWT_SECRET` in `server/.env` (copy from `.env.example`). Set `REQUIRED_CLIENT_BUILD` to match the deployed web bundle (`NEXT_PUBLIC_CLIENT_BUILD`).

## Database migrations

After pulling schema changes (e.g. `SessionNonceUse`), run:

`cd server && npx prisma db push` (or `prisma migrate dev`) against your `DATABASE_URL`.

## On-chain claims (Merkle)

`contracts/src/KoynMerkleDistributor.sol` pulls **KOYN** using an OpenZeppelin **StandardMerkleTree** leaf:

`keccak256(bytes.concat(keccak256(abi.encode(account, cumulativeAmountWei))))`.

Off-chain scores → periodic batch → Merkle root → `setMerkleRoot` → users call `claim(cumulativeAmount, proof)`. Fund the distributor with KOYN (transfer from treasury). Generate proofs with [`@openzeppelin/merkle-tree`](https://github.com/OpenZeppelin/merkle-tree) (see `contracts/test/KoynMerkleDistributor.test.ts`).

Gasless claims: wrap user txs in **ERC-4337 + paymaster** only for `claim`, with rate limits.

**API:** `GET /claim/info` returns `merkleDistributor`, `koynToken`, `chainId`, and Alpha flag when `ALPHA_PUBLIC=1`.

**Batch tree:** `cd server && npm run claim:build-tree -- scripts/sample-allocations.json` → writes `merkle-out/claim-batch.json` (root + per-address proofs). See [`docs/ALPHA_LAUNCH_CHECKLIST.md`](docs/ALPHA_LAUNCH_CHECKLIST.md).

## Auth: SIWE + EIP-712 session proof

1. `POST /auth/siwe` verifies EIP-4361 and returns a **15m** `preToken` (`typ: koyn_pre`) plus `sessionTypedData` (typed `Session`).
2. Wallet signs with `eth_signTypedData_v4` (`issuedAt` / `expiresAt` as **0x hex uint256**); `POST /auth/session-proof` verifies with **viem `verifyTypedData`**, stores **`SessionNonceUse`** (replay returns **409** `session_nonce_reused`), then returns a **7d** gameplay JWT (`typ: koyn`).

## Mandatory in-app updates

The web shell calls `GET /client/version` before rendering the game. If `NEXT_PUBLIC_CLIENT_BUILD` is **below** `REQUIRED_CLIENT_BUILD`, the UI is replaced by a blocking screen and the app **auto-reloads** (with cache-clearing) until a new bundle is served. There is **no user toggle** for this behavior.

**Release steps:** ship a new web build with an incremented `NEXT_PUBLIC_CLIENT_BUILD`, then raise `REQUIRED_CLIENT_BUILD` on the server to that value (or lower for emergency-only dev; use `0` on the server to disable the minimum check).

## Gasless UX (recommended path)

Prefer **embedded smart wallets + paymaster on Base**:

1. Deploy or use an **ERC-4337** wallet provider (Coinbase Smart Wallet, Privy, Dynamic, Zerodev paymaster).
2. Sponsor user operations for **scheduled claims** only (mint/transfer-from-treasury or merkle-drop), never for unchecked game spam.
3. Game **clicks remain off-chain** and are settled against the server’s rules; periodic **claims** move tokens with sponsored gas.

Pure “every tap pays gas” is unrealistic at scale—keep taps server-authoritative, batch claims.

## Blockchain choice rationale

**Base**: high throughput versus L1, predictable low fees, strong tooling for sponsored transactions, native bridge liquidity. Alternative: **Polygon PoS** (similar ERC-20 + meta-tx tooling) or **Solana SPL** if you prioritize single-chain DeFi throughput and native sub-cent fees—in that case replicate token + client with `@solana/web3.js` and SPL Token program.
