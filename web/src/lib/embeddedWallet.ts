import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";

const MNEMONIC_KEY = "vybkoyn_mnemonic";

export type EmbeddedAccount = ReturnType<typeof mnemonicToAccount>;

export type EmbeddedWalletCreated = {
  mnemonic: string;
  address: Address;
  account: EmbeddedAccount;
};

export function createEmbeddedWallet(): EmbeddedWalletCreated {
  const mnemonic = generateMnemonic(english);
  const account = mnemonicToAccount(mnemonic);
  return { mnemonic, address: account.address, account };
}

export function loadEmbeddedAccount(): EmbeddedAccount | null {
  try {
    const mnemonic = sessionStorage.getItem(MNEMONIC_KEY);
    if (!mnemonic) return null;
    return mnemonicToAccount(mnemonic);
  } catch {
    return null;
  }
}

export function saveEmbeddedMnemonic(mnemonic: string): Address {
  sessionStorage.setItem(MNEMONIC_KEY, mnemonic);
  return mnemonicToAccount(mnemonic).address;
}

export function clearEmbeddedWallet() {
  sessionStorage.removeItem(MNEMONIC_KEY);
}
