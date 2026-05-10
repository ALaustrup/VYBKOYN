# KOYN — Non-Custodial Wallet Architecture

## Principles

1. **The server never receives unencrypted private keys or raw seed phrases.** No “paste your key” flows in production.
2. **Default path: external wallet** (MetaMask, Rabby, Coinbase Wallet, WalletConnect). The app only requests signatures and addresses.
3. **Optional embedded wallet** (power users / demos): keys are created and stored **only on the client**, encrypted at rest.

## Recommended production pattern

- **SIWE (Sign-In With Ethereum)** to bind `address` ↔ `userId`, followed by a **small EIP-712 `Session` proof** (`POST /auth/session-proof`) keyed by a nonce and time window inside the SIWE-derived **pre-session JWT**.
- **Session**: short-lived SIWE handshake token (`typ: koyn_pre`) only authorizes emitting the EIP-712 signature once; finalized gameplay JWT carries `typ: koyn` after typed-data verification succeeds.
- **Transactions**: user signs in their wallet; for gasless claims, user signs a **permit / typed data** or submits a **UserOperation** through a paymaster you control (rate-limited, abuse-monitored).

## Embedded key storage (if you must support it)

| Layer | Approach |
|-------|----------|
| Generation | `crypto.getRandomValues` → secp256k1 key via audited lib (e.g. `viem` / `ethers` wallet.createRandom) |
| At rest | Encrypt JSON keystore with **scrypt** or **Argon2id** + user password; store ciphertext in `IndexedDB` only |
| Memory | Clear sensitive buffers after use; avoid logging |
| Recovery | User must back up **seed phrase** or export keystore **once**; show clear UX warnings |
| Threat model | Malware and XSS can still exfiltrate keys—**external wallet + hardware is strictly safer** |

## What not to do

- Storing private keys in `localStorage` without strong encryption
- Sending mnemonics to your API “for backup”
- Auto-signing arbitrary transactions without user review
- Reusing the same nonce/challenge across sessions

## Key rotation & compromise

- If embedded wallet is suspected compromised: **abandon address**, move funds to a new wallet, rotate server session.
- Document a **support flow** for lost passwords (cannot decrypt keystore = unrecoverable by design).
