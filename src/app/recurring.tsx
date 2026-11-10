"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity -- the scan refreshes when the address changes; relative times read the clock */

import { useEffect, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { fromRaw, short, toRaw, walruscan } from "./shared";
import { AddressAvatar, isAddr } from "./recipient";
import { TokenLogo } from "./tokens";

type Rec = {
  to: string;
  coinType: string;
  count: number;
  totalRaw: string;
  avgRaw: string;
  lastRaw: string;
  firstMs: number;
  lastMs: number;
  intervalDays: number | null;
  regular: boolean;
  nextExpectedMs: number | null;
};
type Rule = { to: string; coinType: string; symbol: string; action: "keep" | "cancel" | "cap"; cap?: string; at: string; blobId: string };
type Scan = {
  address: string;
  scanned: number;
  sentCount: number;
  recurring: Rec[];
  coinMeta: Record<string, { symbol: string; decimals: number; iconUrl: string | null }>;
  rules: Rule[];
  labels: Record<string, { label: string | null; verdict: "trust" | "block" }>;
  memoryError: string | null;
  report: {
    lastScan: { at: string; recurring: number; transfers: number; blobId: string } | null;
    freshCount: number;
    spend: { coinType: string; symbol: string; amount: string }[];
    newRecipients: string[];
    alerts: { level: "critical" | "high" | "info"; text: string; digest?: string; atMs?: number }[];
  };
};

const ago = (ms: number) => {
  const d = (Date.now() - ms) / 86_400_000;
  if (d < 1 / 24) return `${Math.max(1, Math.round(d * 1440))} min ago`;
  return d < 1 ? `${Math.round(d * 24)}h ago` : `${Math.round(d)}d ago`;
};
const inTime = (ms: number) => {
  const d = (ms - Date.now()) / 86_400_000;
  return d < 1 ? `in ${Math.max(1, Math.round(d * 24))}h` : `in ${Math.round(d)} days`;
};
const freq = (d: number | null) => (d == null ? "" : d < 1 ? `every ${Math.max(1, Math.round(d * 24))}h` : `every ${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"}`);

const ALERT = {
  critical: "bg-rose-500/12 text-rose-100 ring-rose-500/30",
  high: "bg-amber-500/12 text-amber-100 ring-amber-500/30",
  info: "bg-sky-500/12 text-sky-100 ring-sky-500/30",
};
const RULE = {
  keep: { text: "Kept", cls: "bg-emerald-500/15 text-emerald-300" },
  cancel: { text: "Stopped", cls: "bg-rose-500/15 text-rose-300" },
  cap: { text: "Limited", cls: "bg-amber-500/15 text-amber-300" },
} as const;

export default function Recurring() {
  const account = useCurrentAccount();
  const [addr, setAddr] = useState(account?.address ?? "");
  const [editing, setEditing] = useState(false);
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const address = addr.trim().toLowerCase();
  const valid = isAddr(address);

  useEffect(() => {
    if (account?.address && !addr) setAddr(account.address);
  }, [account?.address, addr]);

  useEffect(() => {
    setError(null);
    if (!valid) return setScan(null);
    let cancelled = false;
    setLoading(true);
    fetch("/api/recurring", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) })
      .then((r) => r.json())
      .then((r) => !cancelled && (r.error ? setError(r.error) : (setScan(r), setEditing(false))))
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [address, valid, n]);

  // ---------- Empty state: pick a wallet ----------
  if (!valid || editing) {
    return (
      <div className="pt-6">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-sky-400/10 text-3xl">💧</div>
        <h1 className="text-center text-[28px] font-extrabold leading-tight tracking-tight">Where is your money going?</h1>
        <p className="mx-auto mt-3 max-w-xs text-center text-[15px] leading-relaxed text-zinc-400">
          I watch your wallet for payments that keep repeating, and I remember what you tell me.
        </p>
        <div className="mt-8 space-y-3">
          <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Paste a Sui wallet address" spellCheck={false} className="input font-mono text-sm" />
          {addr && !valid && <p className="px-1 text-sm text-amber-300">That doesn&apos;t look like a full Sui address.</p>}
          {!account && <p className="px-1 text-center text-sm text-zinc-500">or connect your wallet at the top</p>}
        </div>
        <ul className="mt-10 space-y-4">
          {[
            ["🔍", "I find repeating payments", "Subscriptions, payouts, people you pay often."],
            ["✋", "You decide", "Keep it, limit it, or stop it."],
            ["🧠", "I remember", "Next time I tell you what changed, on any device."],
          ].map(([i, t, d]) => (
            <li key={t} className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/[0.05] text-lg">{i}</span>
              <span>
                <span className="block font-semibold">{t}</span>
                <span className="block text-sm text-zinc-400">{d}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">Watchdog</h1>
          <p className="text-sm text-zinc-400">Your spending, remembered.</p>
        </div>
        <button
          onClick={() => setN((x) => x + 1)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3.5 py-2 text-sm font-semibold active:scale-95 disabled:opacity-50"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={loading ? "animate-spin" : ""}>
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
          </svg>
          {loading ? "Checking" : "Check again"}
        </button>
      </div>
      <button onClick={() => setEditing(true)} className="card flex w-full items-center gap-3 px-4 py-3 text-left">
        <AddressAvatar address={address} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-zinc-500">Watching</span>
          <span className="block truncate font-mono text-sm">{short(address)}</span>
        </span>
        <span className="text-sm font-semibold text-sky-300">Change</span>
      </button>

      {loading && (
        <div className="card animate-pulse p-5">
          <div className="h-4 w-2/3 rounded bg-white/10" />
          <div className="mt-3 h-4 w-1/2 rounded bg-white/10" />
          <p className="mt-4 text-sm text-zinc-500">Reading your payments…</p>
        </div>
      )}
      {error && <div className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-rose-500/30">{error}</div>}

      {scan && !loading && (
        <>
          <Report scan={scan} />
          <section>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="text-lg font-bold">Repeating payments</h2>
              <span className="text-sm text-zinc-500">{scan.recurring.length}</span>
            </div>
            {scan.recurring.length === 0 ? (
              <div className="card p-5 text-center">
                <p className="text-2xl">✨</p>
                <p className="mt-2 font-semibold">Nothing repeating</p>
                <p className="mt-1 text-sm text-zinc-400">I checked your last {scan.scanned} transactions. No money is quietly dripping out.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {scan.recurring.map((r) => (
                  <Row key={`${r.to}|${r.coinType}`} r={r} scan={scan} onSaved={() => setN((x) => x + 1)} />
                ))}
              </div>
            )}
          </section>
          <Memory scan={scan} />
          {scan.memoryError && <p className="text-xs text-amber-300">Memory unavailable: {scan.memoryError}</p>}
        </>
      )}
    </div>
  );
}

function Report({ scan }: { scan: Scan }) {
  const r = scan.report;
  const last = r.lastScan;
  return (
    <section className="card overflow-hidden">
      <div className="p-5">
        <div className="flex items-center gap-3">
          <span className="relative grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-sky-400/30 to-violet-400/30 text-lg">
            🐕
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-[#151a28] bg-emerald-400" />
            </span>
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-bold">Your watchdog</span>
            <span className="block text-xs text-zinc-500">{last ? `remembers you · ${ago(Date.parse(last.at))}` : "meeting this wallet"}</span>
          </span>
        </div>
        <p className="mt-3 text-[19px] font-semibold leading-snug">
          {last ? (
            <>
              Welcome back! Last check was {ago(Date.parse(last.at))}.{" "}
              {r.freshCount ? `${r.freshCount} new payment${r.freshCount === 1 ? "" : "s"} since then.` : "Nothing new went out since."}
            </>
          ) : (
            <>First look at this wallet. I&apos;ll remember it, so next time I can tell you what changed.</>
          )}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            [scan.scanned, "txs read"],
            [scan.recurring.length, "repeating"],
            [r.alerts.filter((a) => a.level !== "info").length, "alerts"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-2xl bg-white/[0.04] px-2 py-3 text-center">
              <div className={`font-mono text-2xl font-semibold ${l === "alerts" && Number(v) > 0 ? "text-rose-300" : ""}`}>{v}</div>
              <div className="mt-0.5 text-[11px] font-medium text-zinc-500">{l}</div>
            </div>
          ))}
        </div>
        {r.spend.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {r.spend.map((x) => (
              <span key={x.coinType} className="rounded-full bg-white/[0.06] px-3 py-1.5 font-mono text-sm">
                −{x.amount} {x.symbol}
              </span>
            ))}
          </div>
        )}
        {r.newRecipients.length > 0 && <p className="mt-3 text-sm text-zinc-400">New people paid: {r.newRecipients.join(", ")}</p>}
      </div>
      <div className="space-y-2 border-t border-white/[0.06] p-4">
        {r.alerts.map((a, i) => (
          <div key={i} className={`flex gap-2 rounded-2xl px-3 py-2.5 text-sm ring-1 ${ALERT[a.level]}`}>
            <span>{a.level === "info" ? "ℹ️" : "⚠️"}</span>
            <span className="flex-1">{a.text}</span>
          </div>
        ))}
        {r.alerts.length === 0 && <p className="px-1 text-sm text-emerald-300">✓ All payments follow your rules.</p>}
        <p className="px-1 pt-1 text-xs text-zinc-500">
          Remembered on Walrus · {scan.rules.length} rule{scan.rules.length === 1 ? "" : "s"}
          {last && (
            <>
              {" · "}
              <a href={walruscan(last.blobId)} target="_blank" rel="noreferrer" className="text-violet-300">
                last check
              </a>
            </>
          )}
        </p>
      </div>
    </section>
  );
}

function Row({ r, scan, onSaved }: { r: Rec; scan: Scan; onSaved: () => void }) {
  const meta = scan.coinMeta[r.coinType] ?? { symbol: r.coinType.split("::").pop()!, decimals: 9, iconUrl: null };
  const rule = scan.rules.find((x) => x.to === r.to && x.coinType === r.coinType);
  const who = scan.labels[r.to];
  const [open, setOpen] = useState(false);
  const [capMode, setCapMode] = useState(false);
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(action: "keep" | "cancel" | "cap") {
    setErr(null);
    const capRaw = action === "cap" ? toRaw(cap, meta.decimals) : null;
    if (action === "cap" && !capRaw) return setErr("Enter an amount.");
    setBusy(action);
    try {
      const res = await fetch("/api/rule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: r.to, coinType: r.coinType, symbol: meta.symbol, action, cap: action === "cap" ? cap : undefined, capRaw: capRaw?.toString(), label: who?.label ?? undefined }),
      }).then((x) => x.json());
      if (res.error) throw new Error(res.error);
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="relative">
          <AddressAvatar address={r.to} size={42} />
          <span className="absolute -bottom-1 -right-1">
            <TokenLogo type={r.coinType} iconUrl={meta.iconUrl} symbol={meta.symbol} size={20} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{who?.label ?? short(r.to)}</span>
            {rule && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${RULE[rule.action].cls}`}>{RULE[rule.action].text}</span>}
          </span>
          <span className="block text-sm text-zinc-400">
            {r.count} payments · {freq(r.intervalDays)}
          </span>
        </span>
        <span className="text-right">
          <span className="block font-mono font-semibold">{fromRaw(r.avgRaw, meta.decimals)}</span>
          <span className="block text-xs text-zinc-500">{meta.symbol} each</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-white/[0.06] p-4">
          <p className="text-sm text-zinc-400">
            Total {fromRaw(r.totalRaw, meta.decimals, 2)} {meta.symbol} · last paid {ago(r.lastMs)}
            {r.nextExpectedMs && r.nextExpectedMs > Date.now() ? ` · next ${inTime(r.nextExpectedMs)}` : ""}
          </p>
          {capMode ? (
            <div className="mt-4 space-y-2">
              <input value={cap} onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setCap(e.target.value)} inputMode="decimal" autoFocus placeholder={`Max ${meta.symbol} per payment`} className="input" />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setCapMode(false)} className="rounded-2xl bg-white/[0.06] py-3.5 font-semibold">
                  Back
                </button>
                <button onClick={() => save("cap")} disabled={!!busy} className="btn-primary">
                  {busy ? "Saving…" : "Set limit"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button onClick={() => save("keep")} disabled={!!busy} className="rounded-2xl bg-emerald-500/15 py-3.5 font-semibold text-emerald-200 active:scale-[.98]">
                {busy === "keep" ? "…" : "Keep"}
              </button>
              <button onClick={() => setCapMode(true)} disabled={!!busy} className="rounded-2xl bg-amber-500/15 py-3.5 font-semibold text-amber-200 active:scale-[.98]">
                Limit
              </button>
              <button onClick={() => save("cancel")} disabled={!!busy} className="rounded-2xl bg-rose-500/15 py-3.5 font-semibold text-rose-200 active:scale-[.98]">
                {busy === "cancel" ? "…" : "Stop"}
              </button>
            </div>
          )}
          {err && <p className="mt-2 text-sm text-rose-300">{err}</p>}
          {rule && (
            <p className="mt-3 text-xs text-zinc-500">
              {RULE[rule.action].text}
              {rule.action === "cap" ? ` at ${rule.cap} ${meta.symbol}` : ""} on {rule.at.slice(0, 10)} ·{" "}
              <a href={walruscan(rule.blobId)} target="_blank" rel="noreferrer" className="text-violet-300">
                saved on Walrus
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Memory({ scan }: { scan: Scan }) {
  if (!scan.rules.length) return null;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-lg font-bold">What I remember</h2>
        <span className="text-xs font-semibold text-violet-300">on Walrus</span>
      </div>
      <div className="card divide-y divide-white/[0.06]">
        {scan.rules.slice(0, 6).map((r) => (
          <div key={r.blobId} className="flex items-center gap-3 px-4 py-3">
            <AddressAvatar address={r.to} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{scan.labels[r.to]?.label ?? short(r.to)}</span>
              <span className="block text-xs text-zinc-500">
                {r.action === "cap" ? `Max ${r.cap} ${r.symbol} per payment` : r.action === "cancel" ? `Stop all ${r.symbol} payments` : `${r.symbol} payments are OK`} · {r.at.slice(0, 10)}
              </span>
            </span>
            <a href={walruscan(r.blobId)} target="_blank" rel="noreferrer" className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${RULE[r.action].cls}`}>
              {RULE[r.action].text}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
