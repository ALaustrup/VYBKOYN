# KOYN — Security Audit Checklist (Click Game + Wallet)

## Smart contract (KOYN token)

- [ ] OpenZeppelin **solidity** version aligned with compiler; no custom math
- [ ] Supply / mint policy documented; `mint` gated (onlyOwner or Minter role with timelock)
- [ ] No unsafe `delegatecall` to user-controlled targets
- [ ] Pausable only if required; document user impact
- [ ] Mainnet deploy: multi-sig owner, verified source, supply cap or mint schedule in spec
- [ ] Test: transfer, approve, transferFrom, edge balances, zero-address rejects

## Session auth (SIWE + EIP-712)

- [ ] SIWE verifies against server `CHAIN_ID`
- [ ] EIP-712 `Session` binds `wallet`, `nonce`, `issuedAt`, `expiresAt`, `purpose` (`koyn_session_v1`); rejects invalid `verifyTypedData`
- [ ] Final JWT **`typ === koyn`**; reject `koyn_pre` on gameplay routes (`session_proof_required` / `invalid_session`)
- [ ] Rotate `purpose` constant if migrating session semantics; deploy web + bump `REQUIRED_CLIENT_BUILD` alongside
- [ ] `SessionNonceUse` table deployed; replay of session proof yields **409** (no double-finalize JWT from same `spNonce`)

## Click / leaderboard integrity (server)

- [ ] **No trust in client-reported “earned this tap”**; server recomputes from rules + DB state
- [ ] **Authenticated sessions** (wallet SIWE or signed JWT after login)
- [ ] **Rate limits** per IP + per `userId` + per session (sliding window)
- [ ] **Human timing**: reject taps faster than physical plausibility (e.g. &lt; 50–80ms) with jitter tolerance
- [ ] **Daily / session budgets** for off-chain KOYN credits to cap bot blast radius
- [ ] **Signed challenges** optional: client must include monotonic `tapSeq` + HMAC or include prior server `stateHash`
- [ ] **Leaderboard**: derived from DB `total_score`; no client writes to rank
- [ ] **Admin / SQL**: parameterized queries only (Prisma/ORM OK)
- [ ] **TLS** everywhere; secure cookies; CORS locked to frontend origin

## Wallet & key handling

- [ ] Prefer external wallet; embedded keystore encrypted with strong KDF
- [ ] Never log addresses + signed payloads that replay actions
- [ ] Clear guidance: phishing, fake airdrops, “verify wallet” scams
- [ ] For **gasless relays**: whitelist calldata patterns, limits, monitoring, abuse alerts

## Client rollout

- [ ] Bump `NEXT_PUBLIC_CLIENT_BUILD` on each web release that must supersede stale bundles.
- [ ] Raise `REQUIRED_CLIENT_BUILD` on the API **after** the new bundle is live; rollback by lowering temporarily (avoid unless emergency).
- [ ] Treat `GET /client/version` as ops-critical (monitor uptime; blocking gate depends on it).

## Operational

- [ ] Secrets in env / vault; never in repo
- [ ] Separate staging keys and mainnet treasury
- [ ] Incident runbook: pause mint, revoke minter, communicate
