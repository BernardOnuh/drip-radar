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

const ALERT = { critical: "border-rose-500/40 bg-rose-500/10 text-rose-200", high: "border-amber-500/40 bg-amber-500/10 text-amber-200", info: "border-sky-500/30 bg-sky-500/10 text-sky-200" };

function Report({ scan }: { scan: Scan }) {
  const r = scan.report;
  const last = r.lastScan;
  return (
    <div className="rounded-3xl border border-sky-500/20 bg-gradient-to-b from-sky-500/[0.07] to-transparent p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-400" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">Watchdog report</p>
      </div>
      <p className="mt-2 text-lg font-medium">
        {last ? (
          <>
            Welcome back. I last checked this wallet {ago(Date.parse(last.at))}
            {r.freshCount ? `, and ${r.freshCount} new transfer${r.freshCount === 1 ? "" : "s"} went out since then.` : ". Nothing new has gone out since then."}
          </>
        ) : (
          <>First check of this wallet. I&apos;ll remember what I saw, so next time I can tell you what changed.</>
        )}
      </p>
      {r.spend.length > 0 && (
        <p className="mt-1 text-sm text-zinc-400">
          Spent since last check: <span className="text-zinc-200">{r.spend.map((x) => `${x.amount} ${x.symbol}`).join(" · ")}</span>
          {r.newRecipients.length > 0 && <> · new recipients: <span className="text-zinc-200">{r.newRecipients.join(", ")}</span></>}
        </p>
      )}
      <div className="mt-3 space-y-2">
        {r.alerts.map((a, i) => (
          <div key={i} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${ALERT[a.level]}`}>
            <span>{a.level === "info" ? "ℹ" : "⚠"}</span>
            <span className="flex-1">{a.text}</span>
            {a.atMs && <span className="shrink-0 text-xs opacity-70">{ago(a.atMs)}</span>}
          </div>
        ))}
        {r.alerts.length === 0 && <p className="text-sm text-emerald-300">✓ No rule was broken. Every payment respected your keep / cancel / cap rules.</p>}
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Memory: {scan.rules.length} rule{scan.rules.length === 1 ? "" : "s"} recalled from <span className="text-violet-300">Walrus</span>
        {last && (
          <>
            {" "}· last check{" "}
            <a href={walruscan(last.blobId)} target="_blank" rel="noreferrer" className="text-violet-300 hover:underline">
              stored on Walrus
            </a>
          </>
        )}{" "}
        · this check is being saved now.
      </p>
    </div>
  );
}

const ago = (ms: number) => {
  const d = (Date.now() - ms) / 86_400_000;
  if (d < 1 / 24) return `${Math.max(1, Math.round(d * 1440))} min ago`;
  return d < 1 ? `${Math.round(d * 24)}h ago` : `${Math.round(d)}d ago`;
};
const every = (d: number | null) => (d == null ? "" : d < 1 ? `every ~${Math.max(1, Math.round(d * 24))}h` : `every ~${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"}`);

const RULE_STYLE = {
  keep: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  cancel: "bg-rose-500/15 text-rose-300 ring-rose-500/50",
  cap: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
} as const;

export default function Recurring() {
  const account = useCurrentAccount();
  const [addr, setAddr] = useState(account?.address ?? "");
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
      .then((r) => !cancelled && (r.error ? setError(r.error) : setScan(r)))
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [address, valid, n]);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Which wallet should I watch?</h2>
        <p className="mt-1 text-sm text-zinc-400">
          I read your outgoing payments on Sui via{" "}
          <span className="text-zinc-200">Tatum</span>, spot recurring expenses, and remember every check and every rule you give me in{" "}
          <span className="text-violet-300">Walrus Memory</span>, so I pick up where we left off on any device.
        </p>
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/5 bg-black/30 p-3">
          {valid ? <AddressAvatar address={address} /> : <span className="h-9 w-9 shrink-0 rounded-full border border-dashed border-white/15" />}
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="Your Sui address (or connect a wallet)"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent font-mono text-base outline-none placeholder:text-zinc-600 sm:text-sm"
          />
          {account && address !== account.address.toLowerCase() && (
            <button onClick={() => setAddr(account.address)} className="shrink-0 text-xs text-emerald-300">
              My wallet
            </button>
          )}
        </div>
        {addr && !valid && <p className="mt-2 text-xs text-amber-300">A Sui address is 0x followed by 64 hex characters.</p>}
      </div>

      {loading && <div className="animate-pulse rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-zinc-400">Reading sent transactions via Tatum…</div>}
      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}

      {scan && !loading && (
        <>
          <Report scan={scan} />
          <p className="px-1 text-xs uppercase tracking-wider text-zinc-500">
            Scanned your last {scan.scanned} signed transactions ({scan.sentCount} transfers) · {scan.recurring.length} recurring payment{scan.recurring.length === 1 ? "" : "s"}
          </p>
          {scan.recurring.length === 0 && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-zinc-400">
              No repeating payments found. Nothing is quietly draining this wallet.
            </div>
          )}
          {scan.recurring.map((r) => (
            <RecCard key={`${r.to}|${r.coinType}`} r={r} scan={scan} onSaved={() => (setN((x) => x + 1), window.dispatchEvent(new Event("memory-updated")))} />
          ))}
          {scan.memoryError && <p className="text-xs text-amber-300">Walrus Memory unavailable: {scan.memoryError}</p>}
        </>
      )}
    </div>
  );
}

function RecCard({ r, scan, onSaved }: { r: Rec; scan: Scan; onSaved: () => void }) {
  const meta = scan.coinMeta[r.coinType] ?? { symbol: r.coinType.split("::").pop()!, decimals: 9, iconUrl: null };
  const rule = scan.rules.find((x) => x.to === r.to && x.coinType === r.coinType);
  const who = scan.labels[r.to];
  const [mode, setMode] = useState<null | "cap">(null);
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(action: "keep" | "cancel" | "cap") {
    setErr(null);
    const capRaw = action === "cap" ? toRaw(cap, meta.decimals) : null;
    if (action === "cap" && !capRaw) return setErr("Enter a cap amount.");
    setBusy(action);
    try {
      const res = await fetch("/api/rule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: r.to, coinType: r.coinType, symbol: meta.symbol, action, cap: action === "cap" ? cap : undefined, capRaw: capRaw?.toString(), label: who?.label ?? undefined }),
      }).then((x) => x.json());
      if (res.error) throw new Error(res.error);
      setMode(null);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="relative">
          <AddressAvatar address={r.to} size={44} />
          <span className="absolute -bottom-1 -right-1">
            <TokenLogo type={r.coinType} iconUrl={meta.iconUrl} symbol={meta.symbol} size={22} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{who?.label ?? short(r.to)}</span>
            {who?.verdict === "block" && <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300 ring-1 ring-rose-500/50">blocked</span>}
            {r.regular && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300 ring-1 ring-sky-500/40">regular</span>}
            {rule && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${RULE_STYLE[rule.action]}`}>
                {rule.action === "cap" ? `capped at ${rule.cap} ${meta.symbol}` : rule.action === "cancel" ? "cancelled" : "kept"}
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{short(r.to)}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg">
            {fromRaw(r.avgRaw, meta.decimals)} <span className="text-sm text-zinc-400">{meta.symbol}</span>
          </div>
          <div className="text-xs text-zinc-500">avg per payment</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-black/30 p-2">
          <div className="text-zinc-500">Payments</div>
          <div className="mt-0.5 font-mono text-sm">{r.count}×</div>
        </div>
        <div className="rounded-xl bg-black/30 p-2">
          <div className="text-zinc-500">Frequency</div>
          <div className="mt-0.5 text-sm">{every(r.intervalDays).replace("every ", "") || "–"}</div>
        </div>
        <div className="rounded-xl bg-black/30 p-2">
          <div className="text-zinc-500">Total sent</div>
          <div className="mt-0.5 font-mono text-sm">{fromRaw(r.totalRaw, meta.decimals, 2)}</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Last paid {ago(r.lastMs)}
        {r.nextExpectedMs && r.nextExpectedMs > Date.now() ? ` · next expected in ${every((r.nextExpectedMs - Date.now()) / 86_400_000).replace("every ~", "")}` : ""}
      </p>

      {mode === "cap" ? (
        <div className="mt-4 flex items-center gap-2">
          <input
            value={cap}
            onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setCap(e.target.value)}
            inputMode="decimal"
            autoFocus
            placeholder={`Max ${meta.symbol} per payment`}
            className="input min-w-0 flex-1"
          />
          <button onClick={() => save("cap")} disabled={!!busy} className="btn-primary px-4 py-2.5">
            {busy ? "Saving…" : "Save cap"}
          </button>
          <button onClick={() => setMode(null)} className="text-xs text-zinc-400">
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button onClick={() => save("keep")} disabled={!!busy} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20">
            {busy === "keep" ? "Saving…" : "Keep"}
          </button>
          <button onClick={() => setMode("cap")} disabled={!!busy} className="rounded-xl border border-amber-500/30 bg-amber-500/10 py-2.5 text-sm font-medium text-amber-200 hover:bg-amber-500/20">
            Cap
          </button>
          <button onClick={() => save("cancel")} disabled={!!busy} className="rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5 text-sm font-medium text-rose-200 hover:bg-rose-500/20">
            {busy === "cancel" ? "Saving…" : "Cancel"}
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
      {rule && (
        <p className="mt-2 text-xs text-zinc-500">
          Saved to Walrus on {rule.at.slice(0, 10)} ·{" "}
          <a href={walruscan(rule.blobId)} target="_blank" rel="noreferrer" className="text-violet-300 hover:underline">
            view blob
          </a>
        </p>
      )}
    </div>
  );
}
