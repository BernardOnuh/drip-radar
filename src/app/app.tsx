"use client";

import { useState } from "react";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { dAppKit } from "./dapp-kit";
import Recurring from "./recurring";
import Send from "./send";

const TABS = [
  { id: "radar", label: "Radar", icon: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5M12 7v5l3 2" },
  { id: "send", label: "Guarded send", icon: "M5 19 19 5M9 5h10v10" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function TabIcon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const STEPS = [
  ["1", "Scan", "Tatum reads your sent transactions on Sui Mainnet and finds payments you keep making to the same address."],
  ["2", "Decide", "Keep, cancel or cap each one. Your rule is written to Walrus Memory, memory you own."],
  ["3", "Enforced", "Every future send checks your rules: a cancelled payee is stopped, a payment over your cap is flagged, then Tatum simulates it before you sign."],
];

export default function App() {
  const [tab, setTab] = useState<TabId>(() => (window.location.hash.slice(1) === "send" ? "send" : "radar"));
  const go = (t: TabId) => (setTab(t), history.replaceState(null, "", `#${t}`));
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:py-12">
        <header className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="hidden font-mono text-xs uppercase tracking-[0.2em] text-sky-400 sm:block">Tatum × Walrus Memory · Sui Mainnet</p>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:mt-2 sm:gap-3 sm:text-5xl">
                {/* eslint-disable-next-line @next/next/no-img-element -- static svg logo */}
                <img src="/logo.svg" alt="" className="h-8 w-8 sm:h-12 sm:w-12" />
                <span className="truncate">Drip Radar</span>
              </h1>
            </div>
            <div className="shrink-0">
              <ConnectButton />
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
            Find the payments quietly dripping out of your wallet. Subscriptions, auto-payouts, payments to people you forgot about. Keep, cancel or cap
            each one; your rules live in <span className="text-violet-300">Walrus Memory</span> and every send is checked against them and simulated through{" "}
            <span className="text-zinc-200">Tatum</span>.
          </p>
          <ol className="mt-5 grid gap-3 sm:grid-cols-3">
            {STEPS.map(([n, t, d]) => (
              <li key={n} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-sky-500/15 font-mono text-xs text-sky-300">{n}</span>
                <span className="font-medium">{t}</span>
                <p className="mt-1.5 text-zinc-400">{d}</p>
              </li>
            ))}
          </ol>
        </header>

        <nav className="mb-6 hidden rounded-xl border border-white/10 bg-white/[0.03] p-1 sm:inline-flex">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => go(t.id)} className={`rounded-lg px-4 py-2 text-sm transition ${tab === t.id ? "bg-sky-400 text-black" : "text-zinc-300 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0c10]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg sm:hidden">
          <div className="mx-auto grid max-w-md grid-cols-2">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => go(t.id)} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${tab === t.id ? "text-sky-400" : "text-zinc-400"}`}>
                <TabIcon d={t.icon} />
                {t.label}
              </button>
            ))}
          </div>
        </nav>

        {tab === "radar" ? <Recurring /> : <Send initialTo="" />}
      </div>
    </DAppKitProvider>
  );
}
