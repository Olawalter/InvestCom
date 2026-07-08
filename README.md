# Investment Committee

**Policy-aware DAO investment evaluation powered by GenLayer consensus.**

Investment Committee is an on-chain protocol that lets a DAO define its investment policy in plain language, collect structured proposals from delegates, and receive a consensus-backed recommendation produced by AI validators — all without trusting a single evaluator.

It is not a price oracle. It is not financial advice. It is a **policy evaluation engine** that runs on GenLayer's Intelligent Contract runtime.

---

## What it solves

Treasury decisions in DAOs are messy. Delegates argue over proposals, voting is gameable, and no one can objectively apply a 2,000-word investment policy to five competing proposals at once.

Investment Committee replaces that with a structured flow:

- The DAO writes its investment policy once (risk appetite, liquidity requirements, allocation limits, governance constraints).
- Delegates submit proposals with evidence.
- GenLayer validators — independent nodes each running an LLM — evaluate every proposal against the policy and reach consensus on a recommendation.
- The result is stored on-chain. No single validator can manipulate it.

---

## How it works

```
draft
  └─▶ open_for_proposals               ← DAO opens the committee
        └─▶ proposal_submission_closed  ← DAO closes after deadline
              └─▶ under_consensus_review ← validators evaluate (AI, ~4–8 min)
                    └─▶ appeal_window_open    ← recommendation published; appeal available
                          ├─▶ appeal_under_review ← appeal filed; second AI review
                          │     └─▶ recommendation_issued
                          └─▶ finalized          ← DAO finalizes
```

Each status transition is a separate on-chain transaction. The non-deterministic evaluation steps (`request_recommendation`, `request_appeal_review`) use `gl.vm.run_nondet_unsafe` — the leader validator runs the LLM and proposes a result; every other validator independently re-runs the LLM and checks that the **canonical fields** match before signing.

### Canonical consensus fields

Only these fields must agree between validators. Free-form text fields (`short_reason`, `reason_code`) are deliberately excluded — independent LLM calls will phrase things differently but agree on the structured outcome.

```python
CANONICAL_FIELDS = [
    "verdict",
    "recommended_proposal_id",
    "policy_fit_band",
    "risk_band",
    "liquidity_band",
    "fundamentals_band",
    "governance_band",
    "treasury_objective_fit",
]
```

### Verdict types

| Verdict | Meaning |
|---|---|
| `proposal_recommended` | One proposal clearly best fits policy |
| `no_suitable_proposal` | All proposals violate policy |
| `tie_detected` | Two or more proposals are too close to rank |
| `insufficient_evidence` | Evidence URLs don't support the claims made |
| `policy_violation_detected` | A proposal violates a hard constraint |
| `manual_review_required` | Validators cannot reach a decision |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS v3, custom design system |
| UI primitives | Radix UI |
| Smart contract | Python (GenLayer IntelliContract) |
| Chain | GenLayer StudioNet (chain ID 61999) |
| SDK | genlayer-js 1.1.8, viem |
| Wallet | EIP-6963 injected wallets (MetaMask, Rabby, etc.) |

---

## Project structure

```
.
├── contract/
│   └── investment_committee.py    # GenLayer IntelliContract (Python)
├── scripts/
│   └── deploy.mjs                 # Deployment script
├── src/
│   ├── app/                       # Next.js App Router pages
│   │   ├── page.tsx               # Landing page
│   │   ├── committees/
│   │   │   ├── page.tsx           # Committee list
│   │   │   └── [committeeId]/
│   │   │       ├── page.tsx       # Detail + DAO actions
│   │   │       ├── submit-proposal/
│   │   │       ├── appeal/
│   │   │       └── recommendation/
│   │   └── profile/               # Connected wallet activity
│   ├── components/                # UI components
│   │   ├── CommitteeRecommendationSeal.tsx
│   │   ├── InvestmentProposalCard.tsx
│   │   ├── PolicyPacketPanel.tsx
│   │   ├── ProposalComparisonMatrix.tsx
│   │   ├── RecommendationTimeline.tsx
│   │   └── ...
│   ├── context/
│   │   └── WalletContext.tsx      # Wallet state + modal UI
│   └── lib/
│       ├── genlayer.ts            # Client factory + all contract calls
│       ├── types.ts               # TypeScript types for all entities
│       ├── utils.ts               # formatAddress, cn, etc.
│       └── wallet.ts              # Pure EIP-6963 detection + chain switching
└── tailwind.config.ts
```

---

## Getting started

### Prerequisites

- Node.js 18+
- A deployed Investment Committee contract on GenLayer StudioNet
- MetaMask, Rabby, or any EIP-6963-compatible injected wallet

### Install

```bash
git clone https://github.com/Olawalter/InvestCom.git
cd InvestCom
npm install
```

### Configure environment

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_CHAIN_NAME=GenLayer StudioNet
NEXT_PUBLIC_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_EXPLORER_URL=https://explorer-studio.genlayer.com
NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS=0xYourContractAddressHere
```

### Run the dev server

```bash
npm run dev
# → http://localhost:3000
```

---

## Deploying the contract

The deployment script manually encodes an `addTransaction` call with a zero-address destination (GenLayer's deploy convention), since genlayer-js does not expose `deployContract` in its public API.

```bash
DEPLOY_PRIVATE_KEY=0xYourPrivateKey node scripts/deploy.mjs
```

Copy the output contract address into `NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS`.

> Any change to `CANONICAL_FIELDS`, storage layout, or method signatures in `investment_committee.py` requires a redeployment and address update.

---

## Smart contract reference

All methods live on `InvestmentCommitteeProtocol(gl.Contract)`.

### Write methods

| Method | Who can call | Description |
|---|---|---|
| `create_committee(...)` | Anyone | Creates a new committee in `draft` status |
| `open_committee(id)` | DAO only | Moves to `open_for_proposals` |
| `close_proposals(id)` | DAO only | Moves to `proposal_submission_closed` |
| `cancel_committee(id)` | DAO only | Cancels at any pre-final stage |
| `submit_proposal(id, ...)` | Anyone | Submits a proposal while committee is open |
| `revise_proposal(id, ...)` | Proposer only | Revises while still open and before deadline |
| `request_recommendation(id)` | DAO only | Triggers LLM consensus evaluation (non-deterministic) |
| `file_appeal(id, ...)` | Anyone | Files an appeal during the appeal window |
| `request_appeal_review(id)` | DAO only | Triggers second LLM review on the appeal |
| `finalize_recommendation(id)` | DAO only | Finalizes after the appeal window closes |

### Read methods

| Method | Returns |
|---|---|
| `get_all_committees()` | All committees |
| `get_committee(id)` | Single committee |
| `get_committee_proposals(id)` | All proposals for a committee |
| `get_proposal(id)` | Single proposal |
| `get_recommendation_result(id)` | LLM recommendation result |
| `get_appeal(id)` | Appeal details |
| `get_committees_by_dao(address)` | Committees created by an address |
| `get_proposals_by_proposer(address)` | Proposals from an address |

### Proposal validation constraints

| Field | Constraint |
|---|---|
| `title` | 6–120 characters |
| `summary` | 50–3,000 characters |
| `risk_thesis` | 50–3,000 characters |
| `fundamental_thesis` | 50–3,000 characters |
| `governance_risks` | 30–2,000 characters |
| `allocation_bps` | ≤ `max_single_asset_exposure_bps` set by DAO |
| `evidence_urls` | 1–8 valid HTTPS URLs |

---

## Wallet architecture

Wallet support is pure EIP-6963 — no hardcoded wallet SDK.

**`src/lib/wallet.ts`** — framework-free detection layer:
- `startWalletDetection(onFound)` — subscribes to `eip6963:announceProvider`; falls back to `window.ethereum` after 300ms for legacy wallets
- `switchToStudioNet(provider)` — switches to chain 61999; calls `wallet_addEthereumChain` if unknown
- `requestAccounts` / `getExistingAccounts` — account helpers used during connect and auto-reconnect

**`src/context/WalletContext.tsx`** — React state layer:
- Selection modal when multiple wallets are detected
- Install prompt (MetaMask / Rabby) when no wallet is found
- Auto-reconnects on page refresh via `localStorage` without re-prompting
- Listens for `accountsChanged` and `chainChanged`; silently re-prompts chain switch if the user leaves StudioNet

**Adding a new wallet:** no code changes needed — any EIP-6963 wallet is detected automatically.

---

## Transaction internals

GenLayer StudioNet returns empty on `eth_getTransactionReceipt`, so genlayer-js's default write path hangs indefinitely. All write calls go through a custom `sendWrite` helper in `src/lib/genlayer.ts`:

1. Encode GenVM calldata via `abi.calldata.encode`
2. Serialize the transaction payload via `abi.transactions.serialize`
3. Encode the EVM `addTransaction` call targeting the consensus contract
4. Estimate gas (5s timeout, 200k fallback)
5. Submit via `eth_sendTransaction` through the injected wallet — returns the tx hash immediately
6. The UI polls for committee status changes (8s intervals)

LLM consensus actions poll for up to **10 minutes** (75 × 8s) because validator evaluation typically takes 4–8 minutes on StudioNet.

---

## Design system

Custom Tailwind color palette (`tailwind.config.ts`):

| Token | Hex | Role |
|---|---|---|
| `navy` | `#050A18` | Page background |
| `committee-blue` | `#2563EB` | Primary actions, active borders |
| `signal-cyan` | `#22D3EE` | Connected state, highlights |
| `policy-gold` | `#F5B841` | Policy elements, deadlines |
| `risk-red` | `#FF4D5E` | Risk indicators, destructive actions |
| `liquidity-green` | `#2CE88A` | Success, live indicator |
| `governance-purple` | `#8B5CF6` | Appeals, governance actions |
| `paper-white` | `#F7F3EA` | Primary text |
| `slate-grey` | `#8B93A1` | Secondary text, labels |
| `graphite` | `#111827` | Card/panel backgrounds |

Fonts: Space Grotesk (headings), Inter (body), IBM Plex Mono (code/addresses), Archivo Black (hero accent).

---

## License

MIT

---

*Investment Committee is a research and tooling project built on GenLayer StudioNet. It is not financial advice. The protocol does not guarantee the quality or profitability of any recommendation. All final decisions remain with the DAO.*
