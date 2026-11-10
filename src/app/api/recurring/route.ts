import { after } from "next/server";
import { getActivity, getCoinMetas, isSuiAddress } from "@/lib/tatum";
import { recallAll, recallLastScan, rememberScan } from "@/lib/memory";
import { detectRecurring } from "@/lib/recurring";

export type Alert = { level: "critical" | "high" | "info"; text: string; digest?: string; atMs?: number };

export async function POST(req: Request) {
  const { address: raw } = (await req.json()) as { address?: string };
  const address = (raw ?? "").trim().toLowerCase();
  if (!isSuiAddress(address)) return Response.json({ error: "Enter a full Sui address (0x + 64 hex characters)." }, { status: 400 });

  const [actRes, memRes, scanRes] = await Promise.allSettled([
    getActivity(address, 50, "SENT"),
    recallAll("Recurring payments the user kept, cancelled or capped, and addresses the user trusted or blocked"),
    recallLastScan(address),
  ]);
  if (actRes.status === "rejected") return Response.json({ error: `Couldn't read wallet history via Tatum: ${actRes.reason?.message ?? actRes.reason}` }, { status: 502 });
  const activity = actRes.value;
  const sends = activity.filter((a) => a.kind === "sent" && a.ok && a.counterparty && a.timestampMs);
  const recurring = detectRecurring(activity);
  const coinMeta = await getCoinMetas([...recurring.map((r) => r.coinType), ...sends.flatMap((s) => s.changes.map((c) => c.coinType))]).catch(
    () => ({}) as Record<string, { symbol: string; decimals: number; iconUrl: string | null }>,
  );
  const mem = memRes.status === "fulfilled" ? memRes.value : { rules: [], latest: [] };
  const lastScan = scanRes.status === "fulfilled" ? scanRes.value : null;
  const labels = Object.fromEntries(mem.latest.filter((v) => v.kind === "address").map((v) => [v.address, { label: v.label ?? null, verdict: v.verdict }]));
  const sym = (t: string) => coinMeta[t]?.symbol ?? t.split("::").pop()!;
  const fmt = (raw: bigint, t: string) => {
    const d = coinMeta[t]?.decimals ?? 9;
    return (Number(raw) / 10 ** d).toLocaleString("en-US", { maximumFractionDigits: 4 });
  };
  const name = (to: string) => labels[to]?.label ?? `${to.slice(0, 8)}…${to.slice(-4)}`;

  // Rule breaches: payments made after the user cancelled or capped that payee.
  const alerts: Alert[] = [];
  for (const s of sends) {
    for (const c of s.changes) {
      const amt = -BigInt(c.amount);
      if (amt <= BigInt(0)) continue;
      const rule = mem.rules.find((r) => r.to === s.counterparty && r.coinType === c.coinType);
      if (!rule || s.timestampMs! <= Date.parse(rule.at)) continue;
      if (rule.action === "cancel")
        alerts.push({ level: "critical", text: `Paid ${fmt(amt, c.coinType)} ${sym(c.coinType)} to ${name(s.counterparty!)} after you cancelled it.`, digest: s.digest, atMs: s.timestampMs! });
      else if (rule.action === "cap" && rule.capRaw && amt > BigInt(rule.capRaw))
        alerts.push({ level: "high", text: `Paid ${fmt(amt, c.coinType)} ${sym(c.coinType)} to ${name(s.counterparty!)}, over your ${rule.cap} ${rule.symbol} cap.`, digest: s.digest, atMs: s.timestampMs! });
    }
  }
  for (const s of sends)
    if (labels[s.counterparty!]?.verdict === "block")
      alerts.push({ level: "critical", text: `A payment went to ${name(s.counterparty!)}, an address you blocked.`, digest: s.digest, atMs: s.timestampMs! });

  // What changed since the watchdog last looked.
  const sinceMs = lastScan ? Date.parse(lastScan.at) : null;
  const fresh = sinceMs ? sends.filter((s) => s.timestampMs! > sinceMs) : [];
  const older = new Set(sends.filter((s) => !sinceMs || s.timestampMs! <= sinceMs).map((s) => s.counterparty));
  const spend: Record<string, bigint> = {};
  for (const s of fresh) for (const c of s.changes) if (BigInt(c.amount) < BigInt(0)) spend[c.coinType] = (spend[c.coinType] ?? BigInt(0)) - BigInt(c.amount);
  const newRecipients = [...new Set(fresh.map((s) => s.counterparty!).filter((t) => !older.has(t)))];
  if (lastScan && recurring.length > lastScan.recurring)
    alerts.push({ level: "info", text: `${recurring.length - lastScan.recurring} new recurring payment(s) appeared since your last check.` });

  const report = {
    lastScan: lastScan ? { at: lastScan.at, recurring: lastScan.recurring, transfers: lastScan.transfers, blobId: lastScan.blobId } : null,
    freshCount: fresh.length,
    spend: Object.entries(spend).map(([coinType, raw]) => ({ coinType, symbol: sym(coinType), amount: fmt(raw, coinType) })),
    newRecipients: newRecipients.map(name),
    alerts: alerts.sort((a, b) => (b.atMs ?? 0) - (a.atMs ?? 0)).slice(0, 8),
  };

  // Remember this check so the next session (any device) picks up from here.
  if (memRes.status === "fulfilled")
    after(() =>
      rememberScan({ address, lastTxMs: sends[0]?.timestampMs ?? null, transfers: sends.length, recurring: recurring.length }).catch(() => {}),
    );

  return Response.json({
    address,
    scanned: activity.length,
    sentCount: sends.length,
    recurring,
    coinMeta,
    rules: mem.rules,
    labels,
    report,
    memoryError: memRes.status === "rejected" ? String(memRes.reason?.message ?? memRes.reason) : null,
  });
}
