# Drip Radar

**An expense watchdog agent for your Sui wallet, with long-term memory.** It finds the payments quietly dripping out of your wallet, learns your keep, cancel and cap rules, and remembers every check in Walrus Memory. When you come back, on any device, it picks up where it left off and tells you what changed.

Track: **Smart Agents for Real Life** (expense watchdog with long-term memory).

Built for the Tatum × Walrus Memory "Total Recall" hackathon, on Sui Mainnet.

## What it does
- **Watchdog report:** each check is remembered in Walrus Memory. The next session opens with what changed since then: new transfers, how much was spent, new recipients, new recurring payments, and any payment that broke your rules (paid a cancelled payee, went over a cap, or paid a blocked address).
- **Radar:** reads your sent transactions through **Tatum** and finds recurring payments, meaning the same recipient and token paid more than once. For each one it shows how many times, how often, the average amount, the total sent, and when the next payment is due. Payments at a steady interval are marked "regular".
- **Keep / Cancel / Cap:** your decision for each payment is written to **Walrus Memory on Mainnet**, memory you own, which persists across devices and sessions.
- **Guarded send:** every send is checked against your rules.
  - Paying a cancelled recipient is **stopped**.
  - Going over your cap is **flagged**.
  - Payments you kept are recognised.
  - Before your wallet signs, the transfer is **simulated through Tatum**.

## How it uses Tatum
The Tatum Sui Mainnet GraphQL gateway (`sui-mainnet.gateway.tatum.io/graphql`) is used for:
- reading sent-transaction history and balance changes
- recipient profiles
- coin metadata
- `simulateTransaction`

The wallet's own client is also routed through a Tatum proxy (`/api/sui`).

## How it uses Walrus Memory
`@mysten-incubation/memwal` against the Mainnet relayer:
- Each keep, cancel or cap rule is stored with `rememberAndWait`, and its blob is linkable on Walruscan.
- `recall` loads your rules on every scan and every send check.
- Every watchdog check is stored as well, so the agent remembers the last time it looked and reports what changed since then.

## Run
```bash
pnpm install
cp .env.example .env.local   # TATUM_API_KEY, MEMWAL_KEY, MEMWAL_ACCOUNT_ID
pnpm dev
```
