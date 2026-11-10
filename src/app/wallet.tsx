"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  useCurrentAccount,
  useDAppKit,
  useWallets,
} from "@mysten/dapp-kit-react";
import { AddressAvatar } from "./recipient";
import { short } from "./shared";

/** App-styled wallet button + bottom-sheet wallet picker. */
export function WalletButton({ full = false }: { full?: boolean }) {
  const account = useCurrentAccount();
  const wallets = useWallets();
  const kit = useDAppKit();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function connect(w: (typeof wallets)[number]) {
    setErr(null);
    setBusy(w.name);
    try {
      await kit.connectWallet({ wallet: w });
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message || "Connection was cancelled.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {account ? (
        <button
          onClick={() => setOpen(true)}
          className={`flex items-center gap-2 rounded-full bg-white/[0.07] py-1.5 pl-1.5 pr-3.5 text-sm font-semibold active:scale-95 ${full ? "w-full justify-center py-3" : ""}`}
        >
          <AddressAvatar address={account.address} size={26} />
          <span className="font-mono">
            {short(account.address).replace(
              /….*/,
              "…" + account.address.slice(-4),
            )}
          </span>
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={`rounded-full bg-sky-400 px-4 py-2.5 text-sm font-bold text-[#06121f] shadow-[0_6px_24px_-8px_rgba(56,189,248,.8)] active:scale-95 ${full ? "w-full rounded-2xl py-3.5 text-base" : ""}`}
        >
          Connect wallet
        </button>
      )}

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
            onClick={() => !busy && setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-[32px] border border-white/10 bg-[#111522] p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:rounded-[32px]"
              style={{ animation: "sheet .28s cubic-bezier(.2,.9,.3,1)" }}
            >
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/15" />
              {account ? (
                <div className="text-center">
                  <div className="flex justify-center">
                    <AddressAvatar address={account.address} size={56} />
                  </div>
                  <p className="mt-3 font-mono text-sm text-zinc-300">
                    {short(account.address)}
                  </p>
                  <div className="mt-5 grid gap-2">
                    <button
                      onClick={() =>
                        navigator.clipboard?.writeText(account.address)
                      }
                      className="rounded-2xl bg-white/[0.06] py-3.5 font-semibold"
                    >
                      Copy address
                    </button>
                    <button
                      onClick={async () => {
                        await kit.disconnectWallet();
                        setOpen(false);
                      }}
                      className="rounded-2xl bg-rose-500/15 py-3.5 font-semibold text-rose-200"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="text-xl font-bold">Connect a wallet</h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    So I can watch your payments and guard your sends. I never
                    move funds without your signature.
                  </p>
                  <div className="mt-5 space-y-2">
                    {wallets.map((w) => (
                      <button
                        key={w.name}
                        onClick={() => connect(w)}
                        disabled={!!busy}
                        className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] p-3.5 text-left active:scale-[.99] hover:bg-white/[0.08]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URIs */}
                        <img
                          src={w.icon}
                          alt=""
                          className="h-10 w-10 rounded-xl"
                        />
                        <span className="flex-1 font-semibold">{w.name}</span>
                        <span className="text-sm text-sky-300">
                          {busy === w.name ? "Opening…" : "Connect"}
                        </span>
                      </button>
                    ))}
                    {wallets.length === 0 && (
                      <div className="rounded-2xl bg-white/[0.05] p-4 text-sm text-zinc-300">
                        No Sui wallet found in this browser. Install{" "}
                        <a
                          href="https://slush.app"
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-sky-300"
                        >
                          Slush
                        </a>{" "}
                        or open this page inside your wallet app&apos;s browser.
                      </div>
                    )}
                  </div>
                  {err && <p className="mt-3 text-sm text-rose-300">{err}</p>}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
