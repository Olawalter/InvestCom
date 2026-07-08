/**
 * Pure wallet detection and connection helpers — no React dependency.
 *
 * Add support for a new injected wallet by ensuring it:
 *   1. Dispatches eip6963:announceProvider (modern wallets already do this), OR
 *   2. Injects window.ethereum (legacy fallback, detected automatically).
 * No code changes required for either case.
 */

// ─── EIP-1193 provider interface ──────────────────────────────────────────────

export interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
}

// ─── Wallet descriptor ────────────────────────────────────────────────────────

export interface InjectedWallet {
  /** EIP-6963 rdns (e.g. "io.metamask") or "legacy" for window.ethereum fallback */
  id: string;
  name: string;
  icon: string; // data URI or empty string for legacy
  provider: EIP1193Provider;
}

// ─── StudioNet chain parameters ───────────────────────────────────────────────

const STUDIONET_CHAIN = {
  chainId: "0xf22f", // 61999
  chainName: "GenLayer StudioNet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: ["https://studio.genlayer.com/api"],
  blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
};

// ─── Wallet detection ─────────────────────────────────────────────────────────

/**
 * Starts EIP-6963 wallet detection and calls `onFound` for each new wallet.
 * Falls back to window.ethereum after `legacyTimeoutMs` if nothing announced.
 * Returns a cleanup function that removes all listeners.
 */
export function startWalletDetection(
  onFound: (wallet: InjectedWallet) => void,
  legacyTimeoutMs = 300
): () => void {
  if (typeof window === "undefined") return () => {};

  const seen = new Set<string>();

  const handleAnnounce = (event: Event) => {
    const { detail } = event as CustomEvent<{
      info: { rdns: string; uuid: string; name: string; icon: string };
      provider: EIP1193Provider;
    }>;
    const id = detail.info.rdns;
    if (seen.has(id)) return;
    seen.add(id);
    onFound({ id, name: detail.info.name, icon: detail.info.icon, provider: detail.provider });
  };

  window.addEventListener("eip6963:announceProvider", handleAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  // Legacy fallback: wallets that pre-date EIP-6963 inject window.ethereum
  const legacyTimer = setTimeout(() => {
    if (seen.size > 0) return; // EIP-6963 wallets already found
    const eth = (
      window as {
        ethereum?: EIP1193Provider & { isMetaMask?: boolean; isRabby?: boolean };
      }
    ).ethereum;
    if (!eth) return;
    const name = eth.isRabby ? "Rabby" : eth.isMetaMask ? "MetaMask" : "Injected Wallet";
    onFound({ id: "legacy", name, icon: "", provider: eth });
  }, legacyTimeoutMs);

  return () => {
    window.removeEventListener("eip6963:announceProvider", handleAnnounce);
    clearTimeout(legacyTimer);
  };
}

// ─── Chain switching ──────────────────────────────────────────────────────────

/**
 * Switches the wallet to GenLayer StudioNet.
 * Adds the chain first if the wallet doesn't know about it yet.
 * Throws if the user rejects (code 4001).
 */
export async function switchToStudioNet(provider: EIP1193Provider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET_CHAIN.chainId }],
    });
    return;
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 4001) throw err; // user rejected — propagate immediately
    // code 4902 = chain unknown, or any other error → try adding
  }
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [STUDIONET_CHAIN],
  });
}

// ─── Account helpers ──────────────────────────────────────────────────────────

/** Requests account access and returns the list of granted accounts. */
export async function requestAccounts(provider: EIP1193Provider): Promise<string[]> {
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts?.length) throw new Error("Wallet returned no accounts.");
  return accounts;
}

/** Returns accounts already exposed to this origin (no prompt). */
export async function getExistingAccounts(provider: EIP1193Provider): Promise<string[]> {
  return (await provider.request({ method: "eth_accounts" })) as string[];
}
