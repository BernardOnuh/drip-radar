# Drip Radar

**An expense watchdog agent for your Sui wallet, with long-term memory.**

Money quietly drips out of crypto wallets: subscriptions, auto-payouts, payments you forgot about. Drip Radar watches your wallet, finds the payments that keep repeating, and learns your rules: keep it, limit it, or stop it. It remembers every rule and every check in **Walrus Memory**. When you come back, on any device, it picks up where it left off and tells you what changed.

- **Hackathon:** Tatum × Walrus Memory, *Total Recall*
- **Track:** Smart Agents for Real Life (expense watchdog with long-term memory)
- **Network:** Sui Mainnet

🎬 **Demo video:** [`demo/drip-radar-demo.mp4`](demo/drip-radar-demo.mp4) (46s)

---

## How it works

| Step | What happens |
|---|---|
| **1. Watch** | Paste a Sui address or connect your wallet. **Tatum** reads your outgoing transactions on Sui Mainnet. |
| **2. Find** | The agent groups payments by recipient and token, then shows how many times you paid, how often, the average amount, the total, and when the next payment is due. Steady ones are marked *regular*. |
| **3. Decide** | Tap a payment and choose **Keep**, **Limit** (a maximum per payment) or **Stop**. Your rule is written to **Walrus Memory on Mainnet**, and its blob is linkable on Walruscan. |
| **4. Remember** | Every check is also saved to Walrus. Next session the **Watchdog report** opens with a "Welcome back" summary of what changed since last time: new payments, how much went out, new recipients, new recurring payments. It also flags every payment that broke a rule: a stopped payee paid again, a payment over a limit, or a payment to a blocked address. |
| **5. Guard** | **Send** checks each new payment against your rules and the recipient's onchain history. It simulates the transfer through **Tatum** before your wallet signs. A stopped payee requires an explicit override. |

## Screens (mobile-first)
- **Watchdog:**
  - agent card with the welcome-back report and quick stats (transactions read, repeating payments, alerts)
  - rule-breach alerts
  - repeating payments with Keep / Limit / Stop
  - "What I remember" (your rules on Walrus)
  - a Check again button
- **Send:** a large amount input, a token picker, and a recipient check as you type. The review opens as a bottom sheet with the verdict and the Tatum simulation, followed by a success sheet.
- **Wallet:** an app-styled Connect button with a bottom-sheet wallet picker (Slush and other Sui wallets).

## How it uses Tatum
All chain access goes through the **Tatum Sui Mainnet GraphQL gateway** (`sui-mainnet.gateway.tatum.io/graphql`):
- sent-transaction history and balance changes, used for recurring-payment detection and the "since last check" report
- recipient profiles: history, first and last activity, SuiNS name, wallet or object
- coin metadata: symbols, decimals and icons
- `simulateTransaction` before every send
- the connected wallet's own client is routed through a Tatum proxy (`/api/sui`)

## How it uses Walrus Memory
`@mysten-incubation/memwal` against the Mainnet relayer, in its own namespace (`drip-radar`):
- **Rules:** each keep, limit or stop decision is stored with `rememberAndWait`, as readable text plus a JSON tail.
- **Agent memory:** every watchdog check (time, transfers, recurring count) is stored, so the next session knows when it last looked and what it saw.
- **Recall:** `recall` loads rules and the last check on every scan and every send review.

## Tech
- Next.js 16 (App Router), React 19, Tailwind v4
- `@mysten/dapp-kit-react` and `@mysten/sui`
- Tatum Sui GraphQL gateway
- Walrus Memory (MemWal)
- Aftermath for the verified token list and prices

## Run locally
```bash
pnpm install
cp .env.example .env.local
# fill in:
#   TATUM_API_KEY          from https://dashboard.tatum.io (API keys)
#   MEMWAL_KEY             from https://memory.walrus.xyz
#   MEMWAL_ACCOUNT_ID      from https://memory.walrus.xyz
#   DRIP_MEMWAL_NAMESPACE  drip-radar
pnpm dev
```
Open http://localhost:3000.

## Project layout
```
src/lib/tatum.ts        Tatum GraphQL client (activity, profiles, metadata)
src/lib/recurring.ts    recurring-payment detection
src/lib/memory.ts       Walrus Memory: rules, scans, verdicts, sends
src/lib/risk.ts         recipient risk + rule enforcement
src/app/api/recurring   scan + watchdog report
src/app/api/rule        save keep / limit / stop
src/app/api/check       recipient check used by Send
src/app/recurring.tsx   Watchdog screen
src/app/send.tsx        Guarded send
src/app/wallet.tsx      wallet button + picker
```
