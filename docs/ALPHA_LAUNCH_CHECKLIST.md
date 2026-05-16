# KOYN Alpha (public test) checklist

## Infrastructure

- [ ] **Local/staging:** `npm run docker:up` (Postgres + API + web) **or** manual Postgres + `npx prisma db push` (includes `SessionNonceUse`).
- [ ] API env: `JWT_SECRET`, `DATABASE_URL`, `CHAIN_ID`, `CORS_ORIGINS` (production web origin only).
- [ ] `REQUIRED_CLIENT_BUILD` aligned with deployed web `NEXT_PUBLIC_CLIENT_BUILD`.
- [ ] TLS termination (reverse proxy or host) on API and web.

## Contracts (Base testnet vs mainnet — pick one for Alpha)

- [ ] Deploy `KOYNToken`; verify on explorer; treasury multisig owns mint (if used).
- [ ] Deploy `KoynMerkleDistributor` with token + initial root (can be zero leaves / placeholder root update before drop).
- [ ] Fund distributor with KOYN for the Alpha allocation budget.
- [ ] Set `KOYN_TOKEN_ADDRESS`, `KOYN_MERKLE_DISTRIBUTOR`, `ALPHA_PUBLIC=1` on API.

## Merkle drops

- [ ] Export leaderboard / allocation CSV → JSON allocations `{ address, cumulativeWei }`.
- [ ] Run `cd server && npm install && npx tsx scripts/build-claim-merkle.ts scripts/sample-allocations.json` (replace input file).
- [ ] Call `setMerkleRoot(root)` on distributor from owner key (timelock/multisig in production).
- [ ] Distribute `claim-batch.json` securely to ops/support only (proofs are sensitive for unreleased roots).

## Smoke tests

- [ ] `npm run test:alpha` from repo root (contracts + server + web typechecks).
- [ ] Health: `GET /health`, `GET /claim/info`, `GET /client/version`.
- [ ] Auth: SIWE → EIP-712 session proof → gameplay JWT; replay same proof → `409 session_nonce_reused`.
- [ ] Game: tap + shop + leaderboard top 20.

## Communication

- [ ] Alpha disclaimer: test balances / resets possible; no financial advice.
- [ ] Support channel for wallet chain mismatch (Base / `CHAIN_ID`).
