import { createWalletClient, custom, type Address, type Hex } from "viem";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getProvider(): EthereumProvider | null {
  const w = typeof window !== "undefined" ? window : undefined;
  const eth = (w as unknown as { ethereum?: EthereumProvider })?.ethereum;
  return eth ?? null;
}

const BASE_MAINNET = {
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
  blockExplorers: { default: { name: "Basescan", url: "https://basescan.org" } },
} as const;

function chainConfig(chainId: number) {
  if (chainId === 8453) return BASE_MAINNET;
  return {
    id: chainId,
    name: "Custom",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  } as const;
}

/**
 * Ensures the injected wallet is on the expected EVM chain before SIWE.
 */
export async function ensureEvmChain(chainId: number): Promise<void> {
  const eth = getProvider();
  if (!eth) throw new Error("no_wallet");

  const hex = ("0x" + chainId.toString(16)) as `0x${string}`;

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  } catch (e: unknown) {
    const code = (e as { code?: number })?.code;
    if (code === 4902 || code === -32603) {
      const baseRpc = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org";
      if (chainId === 8453) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hex,
              chainName: "Base",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: [baseRpc],
              blockExplorerUrls: ["https://basescan.org"],
            },
          ],
        });
        return;
      }
      throw new Error("add_chain_not_configured");
    }
    throw e;
  }
}

/**
 * Sign EIP-4361 SIWE message bytes using viem (uses personal_sign under the hood for EOAs).
 */
export async function signSiweMessage(args: { message: string; address: Address }): Promise<`0x${string}`> {
  const eth = getProvider();
  if (!eth) throw new Error("no_wallet");

  const chain = chainConfig(await getChainId(eth));
  const client = createWalletClient({
    chain,
    transport: custom(eth),
  });

  return client.signMessage({
    account: args.address,
    message: args.message,
  });
}

async function getChainId(eth: EthereumProvider): Promise<number> {
  const id = await eth.request({ method: "eth_chainId", params: [] });
  if (typeof id === "string") return Number.parseInt(id, 16);
  if (typeof id === "number") return id;
  throw new Error("bad_chain_id");
}

export function getInjectedProvider(): EthereumProvider | null {
  return getProvider();
}

/** EIP-712 Session proof from `POST /auth/siwe` — serialized for `eth_signTypedData_v4`. */
export async function signSessionTypedData(args: {
  address: Address;
  sessionTypedData: {
    domain: Record<string, unknown>;
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  };
}): Promise<Hex> {
  const eth = getProvider();
  if (!eth) throw new Error("no_wallet");

  /** Normalize uint256 to 0x hex — matches server envelope and strict EIP-712 wallet parsers. */
  const u256Hex = (raw: unknown): string => {
    const s = String(raw).trim();
    const v = s.startsWith("0x") || s.startsWith("0X") ? BigInt(s) : BigInt(s);
    const h = v.toString(16);
    return `0x${h}`;
  };

  const message = {
    wallet: args.sessionTypedData.message.wallet,
    nonce: args.sessionTypedData.message.nonce,
    issuedAt: u256Hex(args.sessionTypedData.message.issuedAt),
    expiresAt: u256Hex(args.sessionTypedData.message.expiresAt),
    purpose: String(args.sessionTypedData.message.purpose),
  };

  const domain = {
    ...args.sessionTypedData.domain,
    chainId:
      typeof args.sessionTypedData.domain.chainId === "number"
        ? args.sessionTypedData.domain.chainId
        : Number(args.sessionTypedData.domain.chainId),
  };

  const typed = JSON.stringify({
    types: args.sessionTypedData.types,
    primaryType: args.sessionTypedData.primaryType,
    domain,
    message,
  });

  const sig = (await eth.request({
    method: "eth_signTypedData_v4",
    params: [args.address, typed],
  })) as Hex;

  return sig;
}
