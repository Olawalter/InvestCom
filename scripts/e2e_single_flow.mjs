/**
 * Single-flow E2E — full lifecycle demonstration for submission review.
 *
 * Flow:
 *   create_committee → open_committee → submit_proposal → close_proposals
 *   → request_recommendation (LLM consensus, ~4–8 min)
 *   → wait appeal window → finalize_recommendation
 *
 * Usage:
 *   E2E_KEY_DAO=0x<key> node scripts/e2e_single_flow.mjs
 */

import { createAccount, abi, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { encodeFunctionData } from "viem";

const CONTRACT = "0x848ceD2E9e07d69DA133cd425c643B41E43fBf18";
const RPC      = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";

const key = process.env.E2E_KEY_DAO;
if (!key) { console.error("Usage: E2E_KEY_DAO=0x<key> node scripts/e2e_single_flow.mjs"); process.exit(1); }

const dao    = createAccount(key);
const client = createClient({ chain: studionet });

const now   = () => Math.floor(Date.now() / 1000);
const ts    = () => new Date().toISOString().slice(11, 19);
const log   = (msg) => console.log(`[${ts()}] ${msg}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Nonce manager ────────────────────────────────────────────────────────────
let _nonce = undefined;
let _nonceInit = null;
async function getNextNonce() {
  if (_nonce === undefined) {
    if (!_nonceInit) {
      _nonceInit = jsonRpc("eth_getTransactionCount", [dao.address, "latest"])
        .then(hex => { _nonce = parseInt(hex, 16); });
    }
    await _nonceInit;
  }
  return _nonce++;
}

async function jsonRpc(method, params, id = 1) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`RPC ${method}: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function sendWrite(functionName, callArgs) {
  const chain     = studionet;
  const consensus = chain.consensusMainContract;

  const calldataObj = abi.calldata.makeCalldataObject(functionName, callArgs, {});
  const encoded     = abi.calldata.encode(calldataObj);
  const txData      = abi.transactions.serialize([encoded, false]);

  const evmData = encodeFunctionData({
    abi: consensus.abi,
    functionName: "addTransaction",
    args: [
      dao.address,
      CONTRACT,
      chain.defaultNumberOfInitialValidators,
      chain.defaultConsensusMaxRotations,
      txData,
    ],
  });

  let gas = BigInt(200000);
  try {
    const gasHex = await Promise.race([
      jsonRpc("eth_estimateGas", [{ from: dao.address, to: consensus.address, data: evmData }]),
      sleep(5000).then(() => { throw new Error("timeout"); }),
    ]);
    gas = BigInt(gasHex) + BigInt(10000);
  } catch { /* use fallback */ }

  const nonce    = await getNextNonce();
  const gpHex    = await jsonRpc("eth_gasPrice", []);
  const signed   = await dao.signTransaction({
    account: dao, to: consensus.address, data: evmData,
    type: "legacy", nonce, value: BigInt(0),
    gas, gasPrice: BigInt(gpHex), chainId: chain.id,
  });

  return jsonRpc("eth_sendRawTransaction", [signed], 2);
}

async function waitReceipt(txHash, label) {
  process.stdout.write(`  Waiting for receipt (${label})...`);
  for (let i = 0; i < 40; i++) {
    await sleep(4000);
    const r = await jsonRpc("eth_getTransactionReceipt", [txHash], 3).catch(() => null);
    if (r) {
      if (r.status === "0x0") throw new Error(`Transaction reverted: ${txHash}`);
      console.log(" confirmed.");
      return r;
    }
    process.stdout.write(".");
  }
  // StudioNet sometimes returns no receipt — log and proceed
  console.log(" (no receipt returned — StudioNet quirk, proceeding)");
}

async function read(functionName, args = []) {
  return client.readContract({ address: CONTRACT, functionName, args, stateStatus: "accepted" });
}

async function tx(fn, args, label) {
  log(`→ ${label}`);
  const h = await sendWrite(fn, args);
  log(`  tx: ${EXPLORER}/tx/${h}`);
  await waitReceipt(h, label);
  log(`  ✓ ${label}`);
  return h;
}

async function pollStatus(cid, target, timeoutMs = 600_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(12_000);
    try {
      const c = await read("get_committee", [cid]);
      log(`  status → ${c.status}`);
      if (c.status === target) return c;
      if (c.status === "cancelled")
        throw new Error(`Committee cancelled unexpectedly`);
    } catch (e) {
      if (e.message.startsWith("Committee cancelled")) throw e;
      log(`  transient: ${e.message.slice(0, 80)}`);
    }
  }
  throw new Error(`Timeout: committee ${cid} never reached "${target}"`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  InvestmentCommitteeProtocol — Full Lifecycle E2E             ║");
  console.log(`║  Contract : ${CONTRACT}  ║`);
  console.log(`║  Wallet   : ${dao.address}     ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // ── Step 1: Create committee ──────────────────────────────────────────────
  log("STEP 1 — Create committee");
  const proposalDeadline = now() + 60; // 60s window for proposal submission
  const appealWindow     = 30;          // 30s appeal window

  await tx("create_committee", [
    "GenB DAO Treasury Council",
    "Grow the DAO treasury sustainably through low-risk, audited DeFi yield strategies. " +
    "Maintain at least 80% of deployed capital in instruments withdrawable within 72 hours " +
    "without slippage exceeding 0.5%. Prioritise capital preservation over yield maximisation. " +
    "Target a minimum 3.5% APY on deployed capital.",
    "moderate",
    "At least 80% of deployed capital must be withdrawable within 72 hours without slippage " +
    "exceeding 0.5% under normal market conditions. An emergency reserve of 20% must remain " +
    "undeployed in liquid stablecoins at all times.",
    2500,  // max_single_asset_exposure_bps
    4000,  // max_protocol_exposure_bps
    ["stablecoin", "liquid_staking", "money_market", "rwa"],
    ["meme_tokens", "unlocked_vesting_tokens", "derivatives_without_hedge", "low_cap_altcoins"],
    "All target protocols must have a publicly identified, KYC-verified core team, at least " +
    "two independent audits from reputable firms (Trail of Bits, OpenZeppelin, ChainSecurity, " +
    "or equivalent), and a minimum of 6 months of live mainnet history without major incidents.",
    { risk: 30, liquidity: 25, fundamentals: 20, governance: 15, treasury_objective_fit: 10 },
    proposalDeadline,
    appealWindow,
  ], "create_committee");

  // Read count before + after to determine new committee ID reliably.
  // A plain get_all_committees can return stale state if the accepted block
  // hasn't propagated yet; poll until count increases.
  log("  Polling for new committee to appear in accepted state…");
  let cid;
  const allBefore = await read("get_all_committees");
  const prevCount = allBefore.length;
  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(3000);
    const all = await read("get_all_committees").catch(() => allBefore);
    if (all.length > prevCount) {
      cid = all[all.length - 1].committee_id;
      break;
    }
  }
  if (!cid) throw new Error("New committee never appeared in accepted state");
  log(`  Committee ID: ${cid}`);

  // ── Step 2: Open committee ────────────────────────────────────────────────
  log("\nSTEP 2 — Open committee");
  await tx("open_committee", [cid], "open_committee");

  // ── Step 3: Submit proposal ───────────────────────────────────────────────
  log("\nSTEP 3 — Submit proposal (Aave V3 USDC)");
  await tx("submit_proposal", [
    cid,
    "Aave V3 USDC Lending — Ethereum Mainnet",
    "Deploy 20% of idle treasury USDC into Aave V3's lending pool on Ethereum mainnet. " +
    "Aave V3 is the market-leading decentralised lending protocol with over $12 billion TVL " +
    "and a decade of audited, battle-tested smart contract history. This strategy generates " +
    "passive yield (~4.8% APY) on stablecoins while preserving instant withdrawal capability " +
    "through Aave's permissionless instant liquidity mechanism. Zero exploits since launch.",
    "USDC supplied to Aave V3 Ethereum mainnet lending pool",
    2000,  // allocation_bps (20%)
    "90–180 days rolling, renewed quarterly",
    "Permissionless withdrawal in a single Ethereum transaction (~12 seconds). No lock-up " +
    "period. No withdrawal fee. USDC pool utilisation historically below 85%, so instant " +
    "redemption has never been blocked. Fully satisfies the 72-hour 80% liquidity requirement.",
    "Zero exploits since January 2023. Audited by Trail of Bits, OpenZeppelin, and SigmaPrime. " +
    "Aave Safety Module holds $400M+ staked AAVE as a backstop insurance fund. Oracle risk " +
    "managed via Chainlink with circuit breakers. No liquidation risk for USDC suppliers " +
    "(stablecoin lenders cannot be liquidated). Fits DAO moderate risk appetite.",
    "USDC is fully backed by cash and short-dated US Treasuries, attested monthly by Deloitte. " +
    "The USDC market on Aave V3 is the deepest stablecoin lending market in DeFi with " +
    "consistent institutional and retail borrower demand creating durable, predictable yield " +
    "that has remained above 3.5% APY for 18 consecutive months.",
    "Aave DAO governs via AAVE token. Core team at Aave Labs is publicly identified and " +
    "KYC-verified. Governance changes require a 7-day voting period plus 48-hour timelock. " +
    "Emergency Guardian (4-of-10 multi-sig) can pause the protocol but cannot move user " +
    "funds. Two independent audits completed in the past 12 months.",
    ["https://aave.com", "https://defillama.com/protocol/aave-v3"],
  ], "submit_proposal");

  // ── Step 4: Wait for proposal deadline, then close ────────────────────────
  log("\nSTEP 4 — Wait for proposal deadline, then close proposals");
  const waitMs = proposalDeadline * 1000 - Date.now() + 5000;
  if (waitMs > 0) {
    log(`  ⏳ Waiting ${Math.ceil(waitMs / 1000)}s for deadline…`);
    await sleep(waitMs);
  }
  await tx("close_proposals", [cid], "close_proposals");

  // ── Step 5: Request LLM consensus ────────────────────────────────────────
  log("\nSTEP 5 — Request recommendation (LLM consensus)");
  await tx("request_recommendation", [cid], "request_recommendation");
  log("  ⏳ Waiting for GenLayer validators to run LLM evaluation (~4–8 min)…");

  const committee = await pollStatus(cid, "appeal_window_open", 600_000);

  const rec = await read("get_recommendation_result", [cid]);
  console.log("\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Verdict          : ${rec.verdict}`);
  console.log(`  Recommended ID   : ${rec.recommended_proposal_id}`);
  console.log(`  Confidence       : ${rec.confidence}%`);
  console.log(`  Policy fit band  : ${rec.policy_fit_band}`);
  console.log(`  Risk band        : ${rec.risk_band}`);
  console.log(`  Liquidity band   : ${rec.liquidity_band}`);
  console.log(`  Short reason     : ${rec.short_reason}`);
  console.log("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── Step 6: Wait for appeal window, then finalize ────────────────────────
  log("STEP 6 — Wait for appeal window to expire, then finalize");
  const appealExpiry = (committee.appeal_deadline ?? (now() + appealWindow)) * 1000;
  const waitAppeal   = appealExpiry - Date.now() + 5000;
  if (waitAppeal > 0) {
    log(`  ⏳ Waiting ${Math.ceil(waitAppeal / 1000)}s for appeal window (${appealWindow}s)…`);
    await sleep(waitAppeal);
  }

  await tx("finalize_recommendation", [cid], "finalize_recommendation");

  // ── Final read ────────────────────────────────────────────────────────────
  const final = await read("get_committee", [cid]);
  const finalProposals = await read("get_committee_proposals", [cid]);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  FINAL STATE                                                  ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Committee ID   : ${String(cid).padEnd(43)}║`);
  console.log(`║  Status         : ${String(final.status).padEnd(43)}║`);
  console.log(`║  Finalized      : ${String(final.finalized).padEnd(43)}║`);
  console.log(`║  Verdict        : ${String(rec.verdict).padEnd(43)}║`);
  console.log(`║  Proposals      : ${String(finalProposals.length).padEnd(43)}║`);
  console.log(`║  Explorer       :                                              ║`);
  console.log(`║    ${(EXPLORER + "/address/" + CONTRACT).slice(0, 58).padEnd(58)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");

  if (final.status === "finalized" && final.finalized === true) {
    console.log("\n  🎉 FULL LIFECYCLE COMPLETE — contract is working end-to-end");
  } else {
    console.log(`\n  ⚠  Unexpected final state: status=${final.status} finalized=${final.finalized}`);
    process.exit(1);
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
