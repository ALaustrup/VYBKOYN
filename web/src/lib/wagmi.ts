import { http, createConfig, type CreateConnectorFn } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";

const connectors: CreateConnectorFn[] = [
  injected({ shimDisconnect: true }),
  coinbaseWallet({ appName: "VYBKOYN" }),
];

if (projectId) {
  connectors.push(
    walletConnect({
      projectId,
      showQrModal: true,
      metadata: {
        name: "VYBKOYN",
        description: "Tap mining on Base",
        url: typeof window !== "undefined" ? window.location.origin : "https://vybkoyn.app",
        icons: [],
      },
    })
  );
}

export const wagmiConfig = createConfig({
  chains: [base],
  connectors,
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
  },
  ssr: true,
});

export const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "8453");
