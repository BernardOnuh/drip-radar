# Drip Radar

**Find the payments quietly dripping out of your Sui wallet, and stop the ones you don't want.**

Built for the Tatum × Walrus Memory "Total Recall" hackathon, on Sui Mainnet.

## What it does
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

## Run
```bash
pnpm install
cp .env.example .env.local   # TATUM_API_KEY, MEMWAL_KEY, MEMWAL_ACCOUNT_ID
pnpm dev
```
