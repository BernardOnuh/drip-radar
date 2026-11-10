"use client";

import { useState } from "react";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { dAppKit } from "./dapp-kit";
import Recurring from "./recurring";
import Send from "./send";

const TABS = [
  { id: "watch", label: "Watchdog", icon: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5M12 7v5l3 2" },
  { id: "send", label: "Send", icon: "M5 19 19 5M9 5h10v10" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const [tab, setTab] = useState<TabId>(() => (window.location.hash.slice(1) === "send" ? "send" : "watch"));
  const go = (t: TabId) => (setTab(t), history.replaceState(null, "", `#${t}`), window.scrollTo({ top: 0 }));
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <div className="mx-auto w-full max-w-md px-4 pb-32 pt-4 sm:pt-8">
        <header className="sticky top-0 z-30 -mx-4 mb-5 flex items-center justify-between bg-[#0b0e17]/80 px-4 py-3 backdrop-blur-lg">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- static svg logo */}
            <img src="/logo.svg" alt="" className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight">Drip Radar</span>
          </div>
          <ConnectButton />
        </header>

        {tab === "watch" ? <Recurring /> : <Send initialTo="" />}

        <p className="mt-10 text-center text-xs text-zinc-500">
          Memory on <span className="text-violet-300">Walrus</span> · Chain data by <span className="text-zinc-300">Tatum</span> · Sui Mainnet
        </p>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0e17]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg">
        <div className="mx-auto grid max-w-md grid-cols-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => go(t.id)} className={`flex flex-col items-center gap-1 py-3 text-xs font-semibold ${tab === t.id ? "text-sky-300" : "text-zinc-500"}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </DAppKitProvider>
  );
}
