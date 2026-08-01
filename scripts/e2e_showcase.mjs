/**
 * Showcase E2E — distinct committee, full lifecycle.
 *
 * Creates a DeFi Yield Diversification committee for "Arbitrum DAO Grants Council"
 * with two competing proposals (Compound V3 vs Rocket Pool rETH), triggers LLM
 * consensus, waits the appeal window, and finalizes.
 *
 * Usage: E2E_KEY_DAO=0x<key> node scripts/e2e_showcase.mjs
 */

import { createAccount, abi, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { encodeFunctionData } from "viem";

const CONTRACT = "0x848ceD2E9e07d69DA133cd425c643B41E43fBf18";
const RPC      = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";

const key = process.env.E2E_KEY_DAO;
if (!key) { console.error("Usage: E2E_KEY_DAO=0x<key> node scripts/e2e_showcase.mjs"); process.exit(1); }

const dao    = createAccount(key);
const client = createClient({ chain: studionet });

const now   = () => Math.floor(Date.now() / 1000);
const ts    = () => new Date().toISOString().slice(11, 19);
const log   = msg => console.log(`[${ts()}] ${msg}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let _nonce = undefined, _nonceInit = null;
async function getNextNonce() {
  if (_nonce === undefined) {
    if (!_nonceInit) _nonceInit = jsonRpc("eth_getTransactionCount", [dao.address, "latest"])
      .then(hex => { _nonce = parseInt(hex, 16); });
    await _nonceInit;
  }
  return _nonce++;
}

async function jsonRpc(method, params) {
  const r = await fetch(RPC, { method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({jsonrpc:"2.0",id:1,method,params}) });
  const d = await r.json();
  if (d.error) throw new Error(`${method}: ${JSON.stringify(d.error)}`);
  return d.result;
}

async function sendWrite(fn, args) {
  const chain = studionet, consensus = chain.consensusMainContract;
  const encoded = abi.calldata.encode(abi.calldata.makeCalldataObject(fn, args, {}));
  const txData  = abi.transactions.serialize([encoded, false]);
  const evmData = encodeFunctionData({
    abi: consensus.abi, functionName: "addTransaction",
    args: [dao.address, CONTRACT, chain.defaultNumberOfInitialValidators,
           chain.defaultConsensusMaxRotations, txData],
  });
  let gas = BigInt(200000);
  try {
    const g = await Promise.race([
      jsonRpc("eth_estimateGas", [{from:dao.address, to:consensus.address, data:evmData}]),
      sleep(5000).then(() => { throw new Error("timeout"); }),
    ]);
    gas = BigInt(g) + BigInt(10000);
  } catch {}
  const nonce  = await getNextNonce();
  const gp     = BigInt(await jsonRpc("eth_gasPrice", []));
  const signed = await dao.signTransaction({
    account:dao, to:consensus.address, data:evmData,
    type:"legacy", nonce, value:BigInt(0), gas, gasPrice:gp, chainId:chain.id,
  });
  return jsonRpc("eth_sendRawTransaction", [signed]);
}

async function waitReceipt(hash, label) {
  process.stdout.write(`  Waiting for receipt (${label})...`);
  for (let i = 0; i < 40; i++) {
    await sleep(4000);
    const r = await jsonRpc("eth_getTransactionReceipt", [hash]).catch(() => null);
    if (r) { if (r.status === "0x0") throw new Error(`Reverted: ${hash}`); console.log(" ✓"); return r; }
    process.stdout.write(".");
  }
  console.log(" (no receipt — StudioNet quirk, continuing)");
}

async function tx(fn, args, label) {
  log(`→ ${label}`);
  const h = await sendWrite(fn, args);
  log(`  ${EXPLORER}/tx/${h}`);
  await waitReceipt(h, label);
}

async function read(fn, args = []) {
  return client.readContract({ address:CONTRACT, functionName:fn, args, stateStatus:"accepted" });
}

async function pollStatus(cid, target, timeoutMs = 600_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(12_000);
    try {
      const c = await read("get_committee", [cid]);
      log(`  status → ${c.status}`);
      if (c.status === target) return c;
      if (c.status === "cancelled") throw new Error("Committee cancelled");
    } catch(e) {
      if (e.message === "Committee cancelled") throw e;
      log(`  transient: ${e.message.slice(0,80)}`);
    }
  }
  throw new Error(`Timeout waiting for "${target}"`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Arbitrum DAO Grants Council — DeFi Yield Diversification    ║");
  console.log(`║  Contract : ${CONTRACT}  ║`);
  console.log(`║  Wallet   : ${dao.address}     ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // ── Step 1: Create ────────────────────────────────────────────────────────
  log("STEP 1 — Create committee");
  const proposalDeadline = now() + 90;

  const allBefore = await read("get_all_committees");
  const prevCount = allBefore.length;

  await tx("create_committee", [
    "Arbitrum DAO Grants Council",

    "Diversify the Grants Council's idle USDC reserves across two complementary " +
    "on-chain yield strategies, reducing single-protocol concentration risk while " +
    "maintaining full liquidity for ongoing grant disbursements. Target blended yield " +
    "above 4% APY. No single protocol may hold more than 30% of idle reserves. All " +
    "deployed capital must remain withdrawable within 48 hours without penalty.",

    "conservative",

    "A minimum of 90% of deployed capital must be instantly redeemable within 48 hours " +
    "with zero slippage. Yield strategies must carry zero lock-up or exit penalty. " +
    "Emergency withdrawal must be possible in a single transaction.",

    3000,  // max_single_asset_exposure_bps — 30%
    5000,  // max_protocol_exposure_bps — 50%
    ["stablecoin", "money_market", "rwa"],
    ["derivatives_without_hedge", "meme_tokens", "unlocked_vesting_tokens",
     "low_cap_altcoins", "liquid_staking"],

    "Each protocol must have: a publicly identified and doxxed core team, at least " +
    "three independent security audits within the past 18 months, a minimum of " +
    "12 months of live mainnet history without a material security incident, and " +
    "a working emergency pause mechanism that does not allow fund extraction.",

    { risk: 35, liquidity: 30, fundamentals: 20, governance: 10, treasury_objective_fit: 5 },

    proposalDeadline,
    30,  // appeal_window_hours (seconds in test)
  ], "create_committee");

  log("  Polling for new committee…");
  let cid;
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const all = await read("get_all_committees").catch(() => []);
    if (all.length > prevCount) { cid = all[all.length - 1].committee_id; break; }
  }
  if (!cid) throw new Error("New committee never appeared");
  log(`  Committee ID: ${cid}  (${EXPLORER}/address/${CONTRACT})`);

  // ── Step 2: Open ─────────────────────────────────────────────────────────
  log("\nSTEP 2 — Open committee");
  await tx("open_committee", [cid], "open_committee");

  // ── Step 3: Submit two competing proposals ────────────────────────────────
  log("\nSTEP 3 — Submit proposals");

  await tx("submit_proposal", [
    cid,
    "Compound V3 USDC Comet — Ethereum Mainnet",
    "Allocate 25% of idle USDC into Compound V3's isolated USDC Comet market on " +
    "Ethereum mainnet. Compound V3 is purpose-built for treasury-grade stablecoin " +
    "lending: isolated risk model eliminates multi-asset contagion, 60–65% average " +
    "utilisation provides deep liquidity headroom, and current base supply rate is " +
    "approximately 4.2% APY. Total value locked approximately $1.5B on Ethereum.",
    "USDC supplied to Compound V3 Comet isolated market — Ethereum mainnet",
    2500,  // 25%
    "60–120 days rolling",
    "Instant, permissionless withdrawal in a single Ethereum transaction. No lock-up " +
    "or withdrawal fee. Historical pool utilisation averages 62%, leaving substantial " +
    "liquidity headroom. Fully satisfies the 48-hour 90% liquidity requirement. " +
    "Withdrawals up to $10M have zero slippage impact at current depth.",
    "Compound V3 Comet was audited by OpenZeppelin and via a code4rena community audit. " +
    "The isolated architecture means no exposure to collateral volatility — USDC is " +
    "supplied only; collateral is segregated. Chainlink oracle feeds with multi-source " +
    "aggregation. Zero security incidents since August 2022 launch. Conservative risk profile.",
    "Purpose-built for institutional treasury use. Isolated architecture means no " +
    "cross-collateral contagion. Compound Labs team is publicly identified. Full " +
    "on-chain governance history. USDC Comet has maintained yield above 3.5% APY " +
    "consistently for two years. Directly aligned with conservative DAO liquidity mandate.",
    "COMP token governance with 48-hour voting period and 2-day timelock. Guardian " +
    "pause limited to supply/borrow — cannot drain user funds. Compound Labs team " +
    "is publicly identified and KYC-verified. Audited by OpenZeppelin plus code4rena " +
    "community audit. Protocol has 2+ years of V3 mainnet operation without incident.",
    ["https://compound.finance", "https://defillama.com/protocol/compound-v3"],
  ], "submit_proposal — Compound V3");

  await tx("submit_proposal", [
    cid,
    "Aave V3 USDC Lending — Ethereum Mainnet",
    "Allocate 25% of idle USDC into Aave V3's USDC lending pool on Ethereum mainnet. " +
    "Aave V3 is the market-leading decentralised lending protocol with over $12 billion " +
    "TVL across chains and a decade of security history. Current USDC supply APY is " +
    "approximately 4.8%, generated by overcollateralised borrower demand. Permissionless " +
    "instant withdrawal has never been blocked in the protocol's history.",
    "USDC supplied to Aave V3 Ethereum mainnet lending pool",
    2500,  // 25%
    "90–180 days rolling, reviewed quarterly",
    "Permissionless withdrawal in a single Ethereum transaction (~12 seconds). No lock-up " +
    "or withdrawal fee. USDC pool utilisation historically below 85%. Aave's instant " +
    "liquidity mechanism guarantees same-block withdrawal. Fully satisfies the 48-hour " +
    "90% liquidity requirement with substantial headroom.",
    "Zero exploits since January 2023. Audited by Trail of Bits, OpenZeppelin, and " +
    "SigmaPrime. Aave Safety Module holds $400M+ staked AAVE as insurance backstop. " +
    "Oracle risk managed via Chainlink with circuit breakers. No liquidation risk for " +
    "USDC suppliers. Moderate risk profile well within conservative mandate.",
    "USDC is fully backed by cash and US Treasuries, attested monthly by Deloitte. " +
    "Aave V3 is the deepest stablecoin lending market in DeFi. Consistent institutional " +
    "and retail borrower demand creates durable 3.5–5% APY range maintained for " +
    "18+ consecutive months. Directly aligned with the 4%+ blended yield target.",
    "Aave DAO governs via AAVE token. Core team at Aave Labs is publicly identified " +
    "and KYC-verified. 7-day voting period plus 48-hour timelock on all governance " +
    "changes. Emergency Guardian (4-of-10 multi-sig) can pause but cannot move funds. " +
    "Two independent audits completed in the past 12 months.",
    ["https://aave.com", "https://defillama.com/protocol/aave-v3"],
  ], "submit_proposal — Aave V3");

  // ── Step 4: Wait for deadline, close ────────────────────────────────────
  log("\nSTEP 4 — Wait for proposal deadline, then close");
  const waitMs = proposalDeadline * 1000 - Date.now() + 5000;
  if (waitMs > 0) { log(`  ⏳ ${Math.ceil(waitMs/1000)}s…`); await sleep(waitMs); }
  await tx("close_proposals", [cid], "close_proposals");

  // ── Step 5: Request LLM consensus ────────────────────────────────────────
  log("\nSTEP 5 — Request recommendation (LLM consensus, ~4–8 min)");
  await tx("request_recommendation", [cid], "request_recommendation");

  const committee = await pollStatus(cid, "appeal_window_open", 600_000);

  const rec       = await read("get_recommendation_result", [cid]);
  const proposals = await read("get_committee_proposals", [cid]);
  const winner    = proposals.find(p => p.proposal_id === rec.recommended_proposal_id);

  console.log("\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Verdict        : ${rec.verdict}`);
  console.log(`  Winner ID      : ${rec.recommended_proposal_id}  →  "${winner?.title ?? "none"}"`);
  console.log(`  Confidence     : ${rec.confidence}%`);
  console.log(`  Policy fit     : ${rec.policy_fit_band}`);
  console.log(`  Risk band      : ${rec.risk_band}`);
  console.log(`  Liquidity band : ${rec.liquidity_band}`);
  console.log(`  Reason         : ${rec.short_reason}`);
  console.log("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── Step 6: Wait appeal window, finalize ────────────────────────────────
  log("STEP 6 — Wait for appeal window, then finalize");
  // appeal_deadline can be 0 (falsy) even when set — use > 0 check, not ??
  const appealDeadlineSec = committee.appeal_deadline > 0
    ? committee.appeal_deadline
    : now() + 35;
  const waitAppeal = appealDeadlineSec * 1000 - Date.now() + 5000;
  if (waitAppeal > 0) { log(`  ⏳ ${Math.ceil(waitAppeal/1000)}s appeal window…`); await sleep(waitAppeal); }

  await tx("finalize_recommendation", [cid], "finalize_recommendation");

  // Poll for finalized — consensus propagation takes a few seconds on StudioNet
  log("  Polling for finalized status…");
  const final = await pollStatus(cid, "finalized", 120_000);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  COMPLETE                                                     ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Committee     : #${String(cid).padEnd(53)}║`);
  console.log(`║  DAO           : Arbitrum DAO Grants Council                 ║`);
  console.log(`║  Status        : ${String(final.status).padEnd(45)}║`);
  console.log(`║  Finalized     : ${String(final.finalized).padEnd(45)}║`);
  console.log(`║  Verdict       : ${String(rec.verdict).padEnd(45)}║`);
  console.log(`║  Winner        : ${String(winner?.title ?? "none").slice(0,45).padEnd(45)}║`);
  console.log(`║  Confidence    : ${String(rec.confidence + "%").padEnd(45)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\n  ${EXPLORER}/address/${CONTRACT}`);

  if (final.status !== "finalized" || !final.finalized) {
    console.error(`\n  ⚠  Unexpected: status=${final.status} finalized=${final.finalized}`);
    process.exit(1);
  }
  console.log("\n  🎉 Full lifecycle complete.");
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
