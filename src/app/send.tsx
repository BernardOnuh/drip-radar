"use client";
/* eslint-disable react-hooks/set-state-in-effect -- effects here reset derived UI state on input changes */

import { useEffect, useState } from "react";
import { useCurrentAccount, useCurrentClient, useDAppKit } from "@mysten/dapp-kit-react";
import { WalletButton } from "./wallet";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import {
  LEVEL, SUI_TYPE, SimulationPanel, fromRaw, short, suiscanTx, toRaw, useTokens, walruscan,
  type BalanceChange,
} from "./shared";
import { TokenPicker, TokenPill, useTokenList, usd, type PickedToken } from "./tokens";
import { AddressAvatar, RecipientField, useAddressCheck, type AddressCheck } from "./recipient";

type Review = {
  to: string;
  amountRaw: bigint;
  token: PickedToken;
  check: AddressCheck;
  changes: BalanceChange[];
  simError: string | null;
  gasMocked: boolean;
  tx: Transaction;
};

export default function Send({ initialTo = "" }: { initialTo?: string }) {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const dAppKit = useDAppKit();
  const { tokens, reload } = useTokens();
  const { list, byType } = useTokenList();

  const [to, setTo] = useState(initialTo);
  const [token, setToken] = useState<PickedToken | null>(null);
  const [amount, setAmount] = useState("");
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState<null | "review" | "send" | "trust">(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [override, setOverride] = useState(false);
  const [done, setDone] = useState<{ digest: string; text: string; to: string; memoryBlob?: string; trusted?: string } | null>(null);

  // Default token: SUI from the wallet.
  useEffect(() => {
    if (token) return;
    if (!tokens?.length) {
      const sui = byType.get(SUI_TYPE);
      if (sui) setToken({ type: sui.type, symbol: sui.symbol, decimals: sui.decimals, iconUrl: sui.iconUrl, price: sui.price });
      return;
    }
    const t = tokens.find((x) => x.type === SUI_TYPE) ?? tokens[0];
    const l = byType.get(t.type);
    setToken({ type: t.type, symbol: t.symbol, decimals: t.decimals, iconUrl: l?.iconUrl ?? null, price: l?.price ?? null });
  }, [tokens, byType, token]);

  const recip = useAddressCheck(to);
  const dest = recip.address;
  const validAddr = recip.valid;
  const live = recip.check;
  useEffect(() => setReview(null), [dest]);

  const wTok = tokens?.find((t) => t.type === token?.type);
  const raw = token ? toRaw(amount, token.decimals) : null;
  const insufficient = raw != null && wTok != null && raw > wTok.balance;
  const amtUsd = raw && token?.price ? (Number(raw) / 10 ** token.decimals) * token.price : null;

  async function doReview() {
    if (!account || !token || !raw || !validAddr) return;
    setError(null);
    setDone(null);
    setOverride(false);
    if (dest === account.address.toLowerCase()) return setError("That's your own address.");
    setBusy("review");
    try {
      const tx = new Transaction();
      tx.setSender(account.address);
      tx.transferObjects([coinWithBalance({ type: token.type, balance: raw })], dest);

      const [check, sim] = await Promise.all([
        live?.address === dest
          ? Promise.resolve(live)
          : fetch("/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: dest }) }).then((r) => r.json()),
        (async () => {
          const bytes = await tx.build({ client });
          return client.simulateTransaction({ transaction: bytes, include: { balanceChanges: true } });
        })().catch((e: Error) => ({ error: e.message })),
      ]);
      if (check.error) throw new Error(check.error);

      let changes: BalanceChange[] = [];
      let simError: string | null = null;
      let gasMocked = false;
      if ("error" in sim) simError = sim.error;
      else {
        const t = sim.Transaction ?? sim.FailedTransaction;
        changes = (t?.balanceChanges ?? []) as BalanceChange[];
        if (t && !t.status.success) simError = String(t.status.error?.message ?? "Simulation failed");
        gasMocked = Boolean(sim.gasPaymentMocked);
      }
      // Enforce a recurring-payment cap remembered in Walrus.
      const capRule = (check.memory?.rules ?? []).find(
        (r: { action: string; coinType: string; capRaw?: string }) => r.action === "cap" && r.coinType === token.type && r.capRaw && raw > BigInt(r.capRaw),
      );
      const guarded = capRule
        ? {
            ...check,
            level: check.level === "critical" ? "critical" : "high",
            signals: [{ level: "high", source: "memory", text: `This is more than the ${capRule.cap} ${capRule.symbol} cap you set for payments to this address.` }, ...check.signals],
          }
        : check;
      setReview({ to: dest, amountRaw: raw, token, check: guarded, changes, simError, gasMocked, tx });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function doSend() {
    if (!review) return;
    setBusy("send");
    setError(null);
    try {
      const res = await dAppKit.signAndExecuteTransaction({ transaction: review.tx });
      if (res.FailedTransaction) throw new Error(`Transaction failed: ${res.FailedTransaction.status.error?.message ?? "unknown"}`);
      const digest = res.Transaction.digest;
      const amt = fromRaw(review.amountRaw, review.token.decimals, 9);
      setDone({ digest, text: `${amt} ${review.token.symbol} → ${short(review.to)}`, to: review.to });
      setReview(null);
      setAmount("");
      reload();
      fetch("/api/sent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: review.to, amount: amt, symbol: review.token.symbol, digest }),
      })
        .then((r) => r.json())
        .then((j) => {
          if (j.blobId) setDone((d) => (d ? { ...d, memoryBlob: j.blobId } : d));
          window.dispatchEvent(new Event("memory-updated"));
        })
        .catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function trustRecipient() {
    if (!done) return;
    setBusy("trust");
    try {
      const r = await fetch("/api/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: done.to, verdict: "trust", reason: "Sent funds here successfully" }),
      }).then((r) => r.json());
      if (r.error) throw new Error(r.error);
      setDone((d) => (d ? { ...d, trusted: r.blobId } : d));
      window.dispatchEvent(new Event("memory-updated"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const blocked = review?.check.level === "critical" && !override;

  const lv = review ? LEVEL[review.check.level] : null;
  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-[26px] font-extrabold tracking-tight">Send</h1>
        <p className="text-sm text-zinc-400">I check every payment against your rules before you sign.</p>
      </div>

      {/* Amount */}
      <div className="card px-5 pb-5 pt-6 text-center">
        <input
          value={amount}
          onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && (setAmount(e.target.value), setReview(null))}
          inputMode="decimal"
          placeholder="0"
          className="w-full bg-transparent text-center font-mono text-5xl font-semibold tracking-tight outline-none placeholder:text-zinc-700"
        />
        <div className="mt-1 h-5 text-sm text-zinc-500">{usd(amtUsd)}</div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <TokenPill token={token} onClick={() => setPicker(true)} />
          {wTok && token && (
            <button
              onClick={() => {
                const keep = token.type === SUI_TYPE ? BigInt(20_000_000) : BigInt(0);
                const v = wTok.balance > keep ? wTok.balance - keep : BigInt(0);
                setAmount(fromRaw(v, wTok.decimals, wTok.decimals).replace(/,/g, ""));
              }}
              className="rounded-full bg-sky-400/15 px-3 py-2 text-xs font-bold text-sky-300 active:scale-95"
            >
              MAX
            </button>
          )}
        </div>
        {wTok && <p className="mt-3 text-xs text-zinc-500">Balance {fromRaw(wTok.balance, wTok.decimals)} {wTok.symbol}</p>}
      </div>

      {/* Recipient */}
      <RecipientField value={to} onChange={setTo} state={recip} label="Send to" />

      {error && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200 ring-1 ring-rose-500/30">{error}</p>}

      <div className="sticky bottom-24 z-20 pt-1">
        {!account ? (
          <WalletButton full />
        ) : (
          <button onClick={doReview} disabled={!!busy || !raw || !validAddr || insufficient} className="btn-primary w-full text-base shadow-[0_10px_40px_-10px_rgba(56,189,248,.6)]">
            {busy === "review" ? "Checking & simulating…" : !raw ? "Enter an amount" : insufficient ? `Not enough ${token?.symbol}` : !validAddr ? "Add a recipient" : "Review payment"}
          </button>
        )}
      </div>

      {/* Review: bottom sheet */}
      {(review || done) && account && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => !busy && (setReview(null), setDone(null))}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[32px] border border-white/10 bg-[#111522] p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-2xl sm:rounded-[32px]"
            style={{ animation: "sheet .28s cubic-bezier(.2,.9,.3,1)" }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/15" />
            {done ? (
              <div className="text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-3xl text-emerald-300">✓</div>
                <h3 className="mt-4 text-xl font-bold">Payment sent</h3>
                <p className="mt-1 text-zinc-400">{done.text}</p>
                <div className="mt-5 space-y-2 text-sm">
                  <a className="block rounded-2xl bg-white/[0.05] py-3 font-semibold" href={suiscanTx(done.digest)} target="_blank">
                    View transaction ↗
                  </a>
                  {!done.trusted ? (
                    <button onClick={trustRecipient} disabled={!!busy} className="w-full rounded-2xl bg-emerald-500/15 py-3 font-semibold text-emerald-200">
                      {busy === "trust" ? "Saving…" : "Remember this person as trusted"}
                    </button>
                  ) : (
                    <p className="text-emerald-300">Saved. I&apos;ll recognise them next time.</p>
                  )}
                  <p className="pt-1 text-xs text-zinc-500">
                    {done.memoryBlob ? (
                      <a href={walruscan(done.memoryBlob)} target="_blank" className="text-violet-300">
                        Remembered on Walrus ↗
                      </a>
                    ) : (
                      "Saving to Walrus Memory…"
                    )}
                  </p>
                  <button onClick={() => setDone(null)} className="w-full py-2 text-zinc-400">
                    Done
                  </button>
                </div>
              </div>
            ) : (
              review &&
              lv && (
                <>
                  <div className="text-center">
                    <p className="text-sm text-zinc-400">You&apos;re sending</p>
                    <p className="mt-1 font-mono text-4xl font-semibold">
                      {fromRaw(review.amountRaw, review.token.decimals, 6)} <span className="text-2xl text-zinc-400">{review.token.symbol}</span>
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/[0.05] py-1.5 pl-1.5 pr-4">
                      <AddressAvatar address={review.to} size={28} />
                      <span className="font-mono text-sm">{short(review.to)}</span>
                    </div>
                  </div>

                  <div className={`mt-5 rounded-2xl p-4 ring-1 ${lv.cls}`}>
                    <p className="font-bold">{lv.label}</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-zinc-200">
                      {review.check.signals.slice(0, 4).map((x, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="opacity-60">•</span>
                          <span>{x.text}</span>
                        </li>
                      ))}
                      {review.check.signals.length === 0 && <li>No warnings found.</li>}
                    </ul>
                  </div>

                  <details className="mt-3 rounded-2xl bg-white/[0.04] p-4 text-sm">
                    <summary className="cursor-pointer font-semibold">What will happen (simulated by Tatum)</summary>
                    <div className="mt-3">
                      <SimulationPanel changes={review.changes} me={account.address} tokens={tokens} gasMocked={review.gasMocked} />
                    </div>
                  </details>
                  {review.simError && <p className="mt-2 text-sm text-rose-300">Simulation failed: {review.simError}</p>}

                  {review.check.level === "critical" && (
                    <label className="mt-4 flex items-start gap-3 rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200">
                      <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-0.5 h-5 w-5 accent-rose-500" />
                      I understand the risk and still want to send.
                    </label>
                  )}
                  <div className="mt-5 grid grid-cols-[1fr_2fr] gap-2">
                    <button onClick={() => setReview(null)} disabled={!!busy} className="rounded-2xl bg-white/[0.06] py-3.5 font-semibold">
                      Cancel
                    </button>
                    <button onClick={doSend} disabled={!!busy || blocked || !!review.simError} className={`${review.check.level === "critical" ? "btn-danger" : "btn-primary"} text-base`}>
                      {busy === "send" ? "Confirm in wallet…" : "Send now"}
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}

      <TokenPicker
        open={picker}
        onClose={() => setPicker(false)}
        wallet={tokens}
        list={list}
        title="Send which token?"
        onPick={(t) => (setToken(t), setReview(null))}
      />
    </div>
  );
}
