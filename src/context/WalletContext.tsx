"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { getClient } from "@/lib/genlayer";
import {
  type InjectedWallet,
  type EIP1193Provider,
  startWalletDetection,
  switchToStudioNet,
  requestAccounts,
  getExistingAccounts,
} from "@/lib/wallet";
import { X, Wallet } from "lucide-react";

// Re-export so existing imports of DetectedWallet keep working
export type { InjectedWallet };
export type DetectedWallet = InjectedWallet;

// ─── Context shape ────────────────────────────────────────────────────────────

interface WalletContextValue {
  client: ReturnType<typeof getClient> | null;
  address: string | null;
  connecting: boolean;
  wallets: InjectedWallet[];
  connect: (wallet?: InjectedWallet) => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue>({
  client: null,
  address: null,
  connecting: false,
  wallets: [],
  connect: async () => {},
  disconnect: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<ReturnType<typeof getClient> | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [wallets, setWallets] = useState<InjectedWallet[]>([]);

  const [showSelect, setShowSelect] = useState(false);
  const [showNoWallet, setShowNoWallet] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const activeProviderRef = useRef<EIP1193Provider | null>(null);
  const removeListenersRef = useRef<(() => void) | null>(null);

  // ── EIP-6963 wallet detection ───────────────────────────────────────────────
  useEffect(() => {
    const cleanup = startWalletDetection((wallet) => {
      setWallets((prev) =>
        prev.some((w) => w.id === wallet.id) ? prev : [...prev, wallet]
      );
    });
    return cleanup;
  }, []);

  // ── Account + chain change listeners ───────────────────────────────────────
  const attachListeners = useCallback(
    (provider: EIP1193Provider, walletId: string) => {
      const onAccountsChanged = (raw: unknown) => {
        const accounts = raw as string[];
        if (!accounts?.length) {
          // Wallet disconnected or revoked access
          setAddress(null);
          setClient(null);
          activeProviderRef.current = null;
          localStorage.removeItem("ic_wallet_id");
        } else {
          const next = accounts[0];
          setAddress(next);
          setClient(getClient(next, provider));
        }
      };

      // Chain changes: re-prompt switch back to StudioNet silently
      const onChainChanged = () => {
        switchToStudioNet(provider).catch(() => {});
      };

      provider.on("accountsChanged", onAccountsChanged);
      provider.on("chainChanged", onChainChanged);

      removeListenersRef.current = () => {
        provider.removeListener("accountsChanged", onAccountsChanged);
        provider.removeListener("chainChanged", onChainChanged);
      };
    },
    []
  );

  // ── Core connect logic ──────────────────────────────────────────────────────
  const connectToWallet = useCallback(
    async (wallet: InjectedWallet) => {
      setConnecting(true);
      setConnectError(null);
      try {
        await switchToStudioNet(wallet.provider);
        const accounts = await requestAccounts(wallet.provider);
        const addr = accounts[0];

        // Tear down listeners from any previously active wallet
        removeListenersRef.current?.();
        activeProviderRef.current = wallet.provider;

        setAddress(addr);
        setClient(getClient(addr, wallet.provider));
        localStorage.setItem("ic_wallet_id", wallet.id);
        attachListeners(wallet.provider, wallet.id);
      } catch (err: unknown) {
        const e = err as { code?: number; message?: string };
        const msg =
          e?.code === 4001
            ? "Connection rejected by user."
            : e?.message ?? (err instanceof Error ? err.message : "Wallet connection failed.");
        console.error("[WalletContext] connect error:", err);
        setConnectError(msg);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [attachListeners]
  );

  // ── Public connect — shows modal when multiple wallets detected ─────────────
  const connect = useCallback(
    async (wallet?: InjectedWallet) => {
      if (wallet) {
        await connectToWallet(wallet);
        return;
      }
      if (wallets.length === 0) {
        setShowNoWallet(true);
        return;
      }
      if (wallets.length === 1) {
        await connectToWallet(wallets[0]);
        return;
      }
      setShowSelect(true);
    },
    [wallets, connectToWallet]
  );

  // ── Disconnect ──────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    removeListenersRef.current?.();
    removeListenersRef.current = null;
    activeProviderRef.current = null;
    setAddress(null);
    setClient(null);
    localStorage.removeItem("ic_wallet_id");
  }, []);

  // ── Auto-reconnect on page refresh ─────────────────────────────────────────
  useEffect(() => {
    if (wallets.length === 0 || address) return;
    const savedId = localStorage.getItem("ic_wallet_id");
    if (!savedId) return;
    const saved = wallets.find((w) => w.id === savedId);
    if (!saved) return;

    getExistingAccounts(saved.provider)
      .then((accounts) => {
        if (accounts?.length) {
          const addr = accounts[0];
          activeProviderRef.current = saved.provider;
          setAddress(addr);
          setClient(getClient(addr, saved.provider));
          attachListeners(saved.provider, savedId);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets]);

  return (
    <WalletContext.Provider
      value={{ client, address, connecting, wallets, connect, disconnect }}
    >
      {children}

      {showSelect && (
        <WalletSelectModal
          wallets={wallets}
          connectError={connectError}
          connecting={connecting}
          onSelect={async (w) => {
            setConnectError(null);
            try {
              await connectToWallet(w);
              setShowSelect(false);
            } catch {
              // connectError already set inside connectToWallet
            }
          }}
          onClose={() => {
            setShowSelect(false);
            setConnectError(null);
          }}
        />
      )}

      {showNoWallet && (
        <NoWalletModal onClose={() => setShowNoWallet(false)} />
      )}
    </WalletContext.Provider>
  );
}

// ─── Wallet select modal ──────────────────────────────────────────────────────

function WalletSelectModal({
  wallets,
  connectError,
  connecting,
  onSelect,
  onClose,
}: {
  wallets: InjectedWallet[];
  connectError: string | null;
  connecting: boolean;
  onSelect: (w: InjectedWallet) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xs">
        <div className="bg-[#0D1017] border border-white/10 rounded-xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Wallet size={14} className="text-signal-cyan" />
              <span className="font-display font-semibold text-sm text-paper-white">
                Connect wallet
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-slate-grey hover:text-paper-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Wallet list */}
          <div className="p-2">
            {wallets.map((wallet) => (
              <button
                key={wallet.id}
                onClick={() => onSelect(wallet)}
                disabled={connecting}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-committee-blue/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-left"
              >
                {wallet.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={wallet.icon}
                    alt=""
                    className="w-7 h-7 rounded-md flex-shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-md bg-committee-blue/15 flex items-center justify-center flex-shrink-0">
                    <Wallet size={13} className="text-signal-cyan" />
                  </div>
                )}
                <span className="text-sm text-paper-white font-medium">
                  {wallet.name}
                </span>
              </button>
            ))}
          </div>

          {/* Error */}
          {connectError && (
            <div className="mx-2 mb-2 px-2.5 py-1.5 bg-risk-red/10 border border-risk-red/20 rounded-lg">
              <p className="text-xs text-risk-red">{connectError}</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-2 border-t border-white/5 flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-liquidity-green flex-shrink-0" />
            <p className="text-[11px] text-slate-grey">
              GenLayer StudioNet · Chain 61999
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── No wallet installed modal ────────────────────────────────────────────────

function NoWalletModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xs">
        <div className="bg-[#0D1017] border border-white/10 rounded-xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Wallet size={14} className="text-slate-grey" />
              <span className="font-display font-semibold text-sm text-paper-white">
                No wallet detected
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-slate-grey hover:text-paper-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Install options */}
          <div className="p-2">
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-[#F6851B]/30 transition-all"
            >
              <div className="w-7 h-7 rounded-md bg-[#F6851B]/10 flex items-center justify-center flex-shrink-0">
                <span className="text-[#F6851B] text-[11px] font-bold font-mono">M</span>
              </div>
              <span className="text-sm text-paper-white">MetaMask</span>
            </a>
            <a
              href="https://rabby.io/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-governance-purple/30 transition-all"
            >
              <div className="w-7 h-7 rounded-md bg-governance-purple/10 flex items-center justify-center flex-shrink-0">
                <span className="text-governance-purple text-[11px] font-bold font-mono">R</span>
              </div>
              <span className="text-sm text-paper-white">Rabby</span>
            </a>
          </div>

          <div className="px-4 py-2 border-t border-white/5">
            <button
              onClick={onClose}
              className="w-full text-[11px] text-slate-grey hover:text-paper-white transition-colors py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useWallet() {
  return useContext(WalletContext);
}
