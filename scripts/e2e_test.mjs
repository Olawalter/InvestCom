/**
 * E2E test runner for InvestmentCommitteeProtocol on GenLayer StudioNet.
 *
 * Runs 3 flows. Committees are created in parallel, but consensus requests
 * are STAGGERED by 90s to avoid competing for StudioNet's execution slots
 * (max 8 concurrent). Total wall-clock ~20-25 min.
 *
 * Flow A — Aave V3 USDC, single proposal, no appeal, clean finalize
 * Flow B — Lido stETH, single proposal, appeal filed + reviewed, finalize
 * Flow C — Aave V3 vs Compound V3, two competing proposals, evaluator picks
 */

import { createAccount, abi, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { encodeFunctionData } from "viem";

// ─── Config ───────────────────────────────────────────────────────────────────

const CONTRACT = "0x7808f162dDC659da3587283d283C5eBA443b2130";
const RPC      = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";

// Keys from environment — set E2E_KEY_DAO, E2E_KEY_W2, E2E_KEY_W3 before running.
// Example:
//   E2E_KEY_DAO=0x... E2E_KEY_W2=0x... E2E_KEY_W3=0x... node scripts/e2e_test.mjs
function requireEnv(name) {
  const v = process.env[name];
  if (!v) { console.error(`Missing env var: ${name}`); process.exit(1); }
  return v;
}
const dao     = createAccount(requireEnv("E2E_KEY_DAO"));
const wallet2 = createAccount(requireEnv("E2E_KEY_W2"));
const wallet3 = createAccount(requireEnv("E2E_KEY_W3"));

const readClient = createClient({ chain: studionet });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now   = () => Math.floor(Date.now() / 1000);
const ts    = () => new Date().toISOString().slice(11, 19);
const log   = (tag, msg) => console.log(`[${ts()}][${tag}] ${msg}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function jsonRpc(method, params, id = 1) {
  const res  = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`RPC ${method}: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function sendWrite(account, functionName, callArgs) {
  const chain     = studionet;
  const consensus = chain.consensusMainContract;

  const calldataObj = abi.calldata.makeCalldataObject(functionName, callArgs, {});
  const encoded     = abi.calldata.encode(calldataObj);
  const txData      = abi.transactions.serialize([encoded, false]);

  const evmData = encodeFunctionData({
    abi: consensus.abi,
    functionName: "addTransaction",
    args: [
      account.address,
      CONTRACT,
      chain.defaultNumberOfInitialValidators,
      chain.defaultConsensusMaxRotations,
      txData,
    ],
  });

  let gas = BigInt(200000);
  try {
    const gasHex = await Promise.race([
      jsonRpc("eth_estimateGas", [{ from: account.address, to: consensus.address, data: evmData }]),
      sleep(5000).then(() => { throw new Error("timeout"); }),
    ]);
    gas = BigInt(gasHex) + BigInt(10000);
  } catch { /* fallback */ }

  const nonce  = parseInt(await jsonRpc("eth_getTransactionCount", [account.address, "latest"]), 16);
  const gpHex  = await jsonRpc("eth_gasPrice", []);
  const signed = await account.signTransaction({
    account, to: consensus.address, data: evmData,
    type: "legacy", nonce, value: BigInt(0),
    gas, gasPrice: BigInt(gpHex), chainId: chain.id,
  });

  return jsonRpc("eth_sendRawTransaction", [signed], 2);
}

async function waitReceipt(txHash) {
  for (let i = 0; i < 40; i++) {
    await sleep(4000);
    const r = await jsonRpc("eth_getTransactionReceipt", [txHash], 3).catch(() => null);
    if (r) {
      if (r.status === "0x0") throw new Error(`Transaction reverted: ${txHash}`);
      return r;
    }
  }
  // StudioNet sometimes returns no receipt — proceed anyway
}

async function read(functionName, args = []) {
  return readClient.readContract({
    address: CONTRACT,
    functionName,
    args,
    stateStatus: "accepted",
  });
}

async function pollStatus(cid, targetStatus, tag, timeoutMs = 1800_000) {
  const ALT = [
    "no_suitable_proposal", "insufficient_evidence",
    "policy_violation_detected", "manual_review_required",
  ];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(12_000);
    try {
      const c = await read("get_committee", [cid]);
      log(tag, `status → ${c.status}`);
      if (c.status === targetStatus) return c;
      if (targetStatus === "appeal_window_open" && ALT.includes(c.status)) {
        log(tag, `⚠ alternate verdict: ${c.status}`);
        return c;
      }
      if (["finalized", "cancelled"].includes(c.status))
        throw new Error(`Unexpected terminal: ${c.status}`);
    } catch (e) {
      if (e.message.startsWith("Unexpected terminal")) throw e;
      log(tag, `transient: ${e.message.replace(/\n/g, " ").slice(0, 80)}`);
    }
  }
  throw new Error(`Timeout: committee ${cid} never reached "${targetStatus}"`);
}

async function tx(account, fn, args, label, tag) {
  log(tag, `→ ${label}`);
  const h = await sendWrite(account, fn, args);
  await waitReceipt(h);
  log(tag, `✓ ${label}`);
}

// ─── Proposal content ─────────────────────────────────────────────────────────

const AAVE = {
  title: "Aave V3 USDC Lending — Ethereum Mainnet",
  summary:
    "Deploy 20% of idle treasury USDC into Aave V3's lending pool on Ethereum mainnet. " +
    "Aave V3 is the market-leading decentralised lending protocol with over $12 billion TVL " +
    "and a decade of audited, battle-tested smart contract history. This strategy generates " +
    "passive yield (~4.8% APY) on stablecoins while preserving instant withdrawal capability " +
    "through Aave's permissionless instant liquidity mechanism. Zero exploits since launch.",
  asset_or_strategy: "USDC supplied to Aave V3 Ethereum mainnet lending pool",
  allocation_bps: 2000,
  expected_holding_period: "90–180 days rolling, renewed quarterly",
  liquidity_profile:
    "Permissionless withdrawal in a single Ethereum transaction (~12 seconds). No lock-up " +
    "period. No withdrawal fee. USDC pool utilisation historically below 85%, so instant " +
    "redemption has never been blocked. Fully satisfies the 72-hour 80% liquidity requirement.",
  risk_thesis:
    "Zero exploits since January 2023. Audited by Trail of Bits, OpenZeppelin, and SigmaPrime. " +
    "Aave Safety Module holds $400M+ staked AAVE as a backstop insurance fund. Oracle risk " +
    "managed via Chainlink with circuit breakers. No liquidation risk for USDC suppliers " +
    "(stablecoin lenders cannot be liquidated). Fits DAO moderate risk appetite.",
  fundamental_thesis:
    "USDC is fully backed by cash and short-dated US Treasuries, attested monthly by Deloitte. " +
    "The USDC market on Aave V3 is the deepest stablecoin lending market in DeFi with " +
    "consistent institutional and retail borrower demand creating durable, predictable yield " +
    "that has remained above 3.5% APY for 18 consecutive months.",
  governance_risks:
    "Aave DAO governs via AAVE token. Core team at Aave Labs is publicly identified and " +
    "KYC-verified. Governance changes require a 7-day voting period plus 48-hour timelock. " +
    "Emergency Guardian (4-of-10 multi-sig) can pause the protocol but cannot move user " +
    "funds. Two independent audits completed in the past 12 months.",
  evidence_urls: ["https://aave.com", "https://defillama.com/protocol/aave-v3"],
};

const LIDO = {
  title: "Lido stETH Liquid Staking — Ethereum Mainnet",
  summary:
    "Stake 20% of DAO ETH holdings via Lido Finance to earn Ethereum consensus layer " +
    "staking rewards through liquid stETH. Lido is the largest liquid staking protocol on " +
    "Ethereum with over $20B staked ETH across 30+ professional node operators. The stETH " +
    "token rebases daily to reflect accumulated rewards, currently yielding approximately " +
    "3.8% APY without a lockup period.",
  asset_or_strategy: "ETH staked via Lido Finance to receive rebasing liquid stETH",
  allocation_bps: 2000,
  expected_holding_period: "180+ days strategic hold",
  liquidity_profile:
    "stETH trades on Curve Finance's ETH/stETH pool with over $200M in liquidity, enabling " +
    "near-instant redemption at under 0.1% slippage for positions below $5M. Approximately " +
    "70% of deployed capital is withdrawable within 72 hours via the Curve pool. The " +
    "remaining 30% can be unstaked via Lido's withdrawal queue (1-5 days). This partially " +
    "satisfies the 80% 72-hour liquidity requirement under normal conditions.",
  risk_thesis:
    "Lido has over $20B staked across 30+ node operators with individual stake caps to prevent " +
    "concentration. Smart contracts audited by Sigma Prime, Quantstamp, MixBytes, and StateMind. " +
    "Slashing risk is socialised across all operators. Primary risk: stETH depeg during market " +
    "stress (max observed 6% depeg in June 2022, fully recovered within 3 months). Moderate risk.",
  fundamental_thesis:
    "Ethereum's proof-of-stake consensus generates sustainable native yield from block proposals " +
    "and attestation rewards — not reliant on inflationary token incentives or unsustainable APY " +
    "mechanics. Lido's node operator model with 30+ validators diversifies execution risk. The " +
    "3.8% APY is denominated in ETH, offering additional upside if ETH appreciates.",
  governance_risks:
    "Lido DAO is governed by LDO token holders. Core team at Lido Labs is publicly identified. " +
    "Four independent security audits completed in 2023-2024. On-chain governance with 72-hour " +
    "voting period and 48-hour timelock. Emergency multi-sig held by 5-of-9 known individuals " +
    "from the Ethereum ecosystem. Protocol has 3+ years of mainnet history.",
  evidence_urls: ["https://lido.fi", "https://defillama.com/protocol/lido"],
};

const COMPOUND = {
  title: "Compound V3 USDC Comet — Ethereum Mainnet",
  summary:
    "Allocate 15% of idle treasury USDC into Compound V3's isolated USDC Comet market on " +
    "Ethereum mainnet. Compound V3 is a purpose-built USDC lending protocol launched August " +
    "2022, designed with an isolated risk model that eliminates multi-asset contagion risk. " +
    "Total value locked approximately $1.5B. Current base supply rate approximately 4.2% APY.",
  asset_or_strategy: "USDC supplied to Compound V3 Comet isolated market on Ethereum mainnet",
  allocation_bps: 1500,
  expected_holding_period: "60–120 days rolling",
  liquidity_profile:
    "Instant, permissionless withdrawal with no lock-up period. Compound V3 Comet historically " +
    "averages 60-65% utilisation — providing deep liquidity headroom for withdrawals up to $10M " +
    "without meaningful slippage. Fully meets the DAO's 80% 72-hour liquidity requirement.",
  risk_thesis:
    "Compound V3 Comet was audited by OpenZeppelin and via a community audit through code4rena. " +
    "The isolated USDC market design eliminates cross-asset contagion risk — only USDC is " +
    "supplied; collateral is entirely segregated. Simplified codebase reduces attack surface " +
    "vs V2. Chainlink oracle feeds with multi-source aggregation. Zero exploits since launch.",
  fundamental_thesis:
    "Compound V3 was purpose-built to satisfy institutional treasury risk requirements. The " +
    "isolated architecture means no exposure to collateral volatility. Compound Labs has a " +
    "publicly identified engineering team with 4+ years of DeFi lending history. Full on-chain " +
    "governance history. USDC Comet has maintained consistent yield above 3.5% APY.",
  governance_risks:
    "Compound Labs team is publicly identified and KYC-verified. Audited by OpenZeppelin plus " +
    "code4rena community audit. COMP token governance with 48-hour voting period and 2-day " +
    "timelock. Guardian pause limited to supply/borrow — cannot drain user funds. Protocol " +
    "has 2+ years of V3 mainnet operation without security incident.",
  evidence_urls: ["https://compound.finance", "https://defillama.com/protocol/compound-v3"],
};

// ─── Committee builder ────────────────────────────────────────────────────────

function committeeArgs(appealWindow) {
  return [
    "GenB DAO Treasury Council",
    "Grow the DAO treasury sustainably through low-risk, audited DeFi yield strategies. " +
      "Maintain at least 80% of deployed capital in instruments withdrawable within 72 hours " +
      "without slippage exceeding 0.5%. Prioritise capital preservation over yield maximisation. " +
      "Target a minimum 3.5% APY on deployed capital.",
    "moderate",
    "At least 80% of deployed capital must be withdrawable within 72 hours without slippage " +
      "exceeding 0.5% under normal market conditions. An emergency reserve of 20% must remain " +
      "undeployed in liquid stablecoins at all times.",
    2500,   // max_single_asset_exposure_bps
    4000,   // max_protocol_exposure_bps
    ["stablecoin", "liquid_staking", "money_market", "rwa"],
    ["meme_tokens", "unlocked_vesting_tokens", "derivatives_without_hedge", "low_cap_altcoins"],
    "All target protocols must have a publicly identified, KYC-verified core team, at least " +
      "two independent audits from reputable firms (Trail of Bits, OpenZeppelin, ChainSecurity, " +
      "or equivalent), and a minimum of 6 months of live mainnet history without major incidents.",
    { risk: 30, liquidity: 25, fundamentals: 20, governance: 15, treasury_objective_fit: 10 },
    now() + 45,        // proposal_deadline: 45 seconds from now
    appealWindow,
  ];
}

function proposalArgs(cid, p) {
  return [
    cid, p.title, p.summary, p.asset_or_strategy, p.allocation_bps,
    p.expected_holding_period, p.liquidity_profile, p.risk_thesis,
    p.fundamental_thesis, p.governance_risks, p.evidence_urls,
  ];
}

// ─── Flow A: Aave V3, single proposal, no appeal ─────────────────────────────

async function flowA(cid, startDelayMs = 0) {
  const TAG      = `A:${cid}`;
  const deadline = now() + 45;
  try {
    await tx(dao, "open_committee", [cid], "Open committee", TAG);

    await tx(wallet2, "submit_proposal", proposalArgs(cid, AAVE),
      "Submit Aave V3 USDC (wallet2)", TAG);

    const wait = deadline * 1000 - Date.now() + 5000;
    if (wait > 0) { log(TAG, `⏳ Waiting ${Math.ceil(wait / 1000)}s for proposal deadline…`); await sleep(wait); }

    await tx(dao, "close_proposals",        [cid], "Close proposals",        TAG);

    // Stagger: wait before requesting consensus
    if (startDelayMs > 0) {
      log(TAG, `⏳ Stagger delay ${startDelayMs / 1000}s before consensus request…`);
      await sleep(startDelayMs);
    }

    await tx(dao, "request_recommendation", [cid], "Request recommendation", TAG);

    log(TAG, "⏳ Waiting for LLM consensus (~4–8 min)…");
    const committee = await pollStatus(cid, "appeal_window_open", TAG);

    const rec = await read("get_recommendation_result", [cid]);
    log(TAG, `✅ Verdict: ${rec.verdict}  proposal: ${rec.recommended_proposal_id}  confidence: ${rec.confidence}%`);
    log(TAG, `   policy_fit=${rec.policy_fit_band}  risk=${rec.risk_band}  liquidity=${rec.liquidity_band}`);
    log(TAG, `   reason: ${rec.short_reason}`);

    const appealWait = (committee.appeal_deadline ?? 0) * 1000 - Date.now() + 5000;
    if (appealWait > 0) { log(TAG, `⏳ Waiting ${Math.ceil(appealWait / 1000)}s for appeal window to expire…`); await sleep(appealWait); }

    await tx(dao, "finalize_recommendation", [cid], "Finalize", TAG);
    const final = await read("get_committee", [cid]);
    log(TAG, `🏁 COMPLETE — status: ${final.status}  finalized: ${final.finalized}`);
    return { flow: "A", cid, verdict: rec.verdict, passed: true };
  } catch (e) {
    log(TAG, `❌ FAILED: ${e.message}`);
    return { flow: "A", cid, error: e.message, passed: false };
  }
}

// ─── Flow B: Lido stETH, appeal filed and reviewed ───────────────────────────

async function flowB(cid, startDelayMs = 0) {
  const TAG      = `B:${cid}`;
  const deadline = now() + 45;
  try {
    await tx(dao, "open_committee", [cid], "Open committee", TAG);

    await tx(wallet3, "submit_proposal", proposalArgs(cid, LIDO),
      "Submit Lido stETH (wallet3)", TAG);

    const wait = deadline * 1000 - Date.now() + 5000;
    if (wait > 0) { log(TAG, `⏳ Waiting ${Math.ceil(wait / 1000)}s for proposal deadline…`); await sleep(wait); }

    await tx(dao, "close_proposals",        [cid], "Close proposals",        TAG);

    if (startDelayMs > 0) {
      log(TAG, `⏳ Stagger delay ${startDelayMs / 1000}s before consensus request…`);
      await sleep(startDelayMs);
    }

    await tx(dao, "request_recommendation", [cid], "Request recommendation", TAG);

    log(TAG, "⏳ Waiting for LLM consensus (~4–8 min)…");
    await pollStatus(cid, "appeal_window_open", TAG);

    const rec = await read("get_recommendation_result", [cid]);
    log(TAG, `✅ Verdict: ${rec.verdict}  liquidity_band=${rec.liquidity_band}`);
    log(TAG, `   reason: ${rec.short_reason}`);

    // File appeal disputing the liquidity assessment
    await tx(wallet2, "file_appeal", [
      cid,
      "liquidity_misread",
      "The recommendation did not apply the DAO's liquidity requirement strictly. " +
      "The policy states that 80% of capital must be withdrawable within 72 hours " +
      "without slippage exceeding 0.5%. Lido's stETH achieves this only via the Curve " +
      "pool, which can compress significantly under market stress. The June 2022 depeg " +
      "showed the pool depth can fail to guarantee the 0.5% slippage threshold for " +
      "large positions. Under conservative stress assumptions, the 80% 72-hour " +
      "withdrawal constraint may not be met. This appeal requests that the liquidity " +
      "assessment be reconsidered against the explicit policy threshold, not just " +
      "average market conditions.",
      ["https://lido.fi"],
    ], "File appeal — liquidity challenge (wallet2)", TAG);

    await tx(dao, "request_appeal_review", [cid], "Request appeal review (LLM)", TAG);

    log(TAG, "⏳ Waiting for appeal consensus (~4–8 min)…");
    await pollStatus(cid, "recommendation_issued", TAG);

    const appeal = await read("get_appeal", [cid]);
    log(TAG, `✅ Appeal: verdict=${appeal.result?.appeal_verdict}  changed=${appeal.result?.final_recommendation_changed}`);
    log(TAG, `   reason: ${appeal.result?.short_reason}`);

    await tx(dao, "finalize_recommendation", [cid], "Finalize", TAG);
    const final = await read("get_committee", [cid]);
    log(TAG, `🏁 COMPLETE — status: ${final.status}  finalized: ${final.finalized}`);
    return { flow: "B", cid, verdict: rec.verdict, appealVerdict: appeal.result?.appeal_verdict, passed: true };
  } catch (e) {
    log(TAG, `❌ FAILED: ${e.message}`);
    return { flow: "B", cid, error: e.message, passed: false };
  }
}

// ─── Flow C: Two competing proposals, evaluator picks winner ─────────────────

async function flowC(cid, startDelayMs = 0) {
  const TAG      = `C:${cid}`;
  const deadline = now() + 45;
  try {
    await tx(dao, "open_committee", [cid], "Open committee", TAG);

    // wallet2 submits Aave V3, wallet3 submits Compound V3
    await tx(wallet2, "submit_proposal", proposalArgs(cid, AAVE),
      "Submit Aave V3 USDC (wallet2)", TAG);
    await tx(wallet3, "submit_proposal", proposalArgs(cid, COMPOUND),
      "Submit Compound V3 USDC (wallet3)", TAG);

    const wait = deadline * 1000 - Date.now() + 5000;
    if (wait > 0) { log(TAG, `⏳ Waiting ${Math.ceil(wait / 1000)}s for proposal deadline…`); await sleep(wait); }

    await tx(dao, "close_proposals",        [cid], "Close proposals",        TAG);

    if (startDelayMs > 0) {
      log(TAG, `⏳ Stagger delay ${startDelayMs / 1000}s before consensus request…`);
      await sleep(startDelayMs);
    }

    await tx(dao, "request_recommendation", [cid], "Request recommendation (2 proposals)", TAG);

    log(TAG, "⏳ Waiting for LLM consensus on 2-way race (~4–8 min)…");
    const committee = await pollStatus(cid, "appeal_window_open", TAG);

    const rec       = await read("get_recommendation_result", [cid]);
    const proposals = await read("get_committee_proposals",   [cid]);
    const winner    = proposals.find(p => p.proposal_id === rec.recommended_proposal_id);

    log(TAG, `✅ Verdict: ${rec.verdict}  winner_id: ${rec.recommended_proposal_id}  confidence: ${rec.confidence}%`);
    if (winner) log(TAG, `   winner: "${winner.title}" by ${winner.proposer}`);
    log(TAG, `   policy_fit=${rec.policy_fit_band}  risk=${rec.risk_band}  liquidity=${rec.liquidity_band}`);
    log(TAG, `   reason: ${rec.short_reason}`);

    const appealWait = (committee.appeal_deadline ?? 0) * 1000 - Date.now() + 5000;
    if (appealWait > 0) { log(TAG, `⏳ Waiting ${Math.ceil(appealWait / 1000)}s for appeal window…`); await sleep(appealWait); }

    await tx(dao, "finalize_recommendation", [cid], "Finalize", TAG);
    const final = await read("get_committee", [cid]);
    log(TAG, `🏁 COMPLETE — status: ${final.status}  finalized: ${final.finalized}`);
    return { flow: "C", cid, verdict: rec.verdict, winner: winner?.title ?? "none", passed: true };
  } catch (e) {
    log(TAG, `❌ FAILED: ${e.message}`);
    return { flow: "C", cid, error: e.message, passed: false };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  InvestmentCommitteeProtocol — E2E Test Suite (Staggered)        ║");
  console.log(`║  Contract : ${CONTRACT}  ║`);
  console.log(`║  DAO      : ${dao.address}     ║`);
  console.log(`║  Wallet2  : ${wallet2.address}     ║`);
  console.log(`║  Wallet3  : ${wallet3.address}     ║`);
  console.log("╠══════════════════════════════════════════════════════════════════╣");
  console.log("║  Consensus requests staggered 90s apart to avoid slot contention ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");

  // Snapshot count so we know the IDs
  const allBefore = await read("get_all_committees");
  const baseId    = allBefore.length + 1;
  log("SETUP", `Current committee count: ${allBefore.length} — new IDs will be ${baseId}, ${baseId + 1}, ${baseId + 2}`);

  // Create all 3 committees sequentially (deterministic IDs)
  log("SETUP", "Creating 3 committees…");
  await (async () => {
    const h1 = await sendWrite(dao, "create_committee", committeeArgs(30));
    await waitReceipt(h1);
    log("SETUP", `✓ Committee A created`);
    const h2 = await sendWrite(dao, "create_committee", committeeArgs(60));
    await waitReceipt(h2);
    log("SETUP", `✓ Committee B created`);
    const h3 = await sendWrite(dao, "create_committee", committeeArgs(30));
    await waitReceipt(h3);
    log("SETUP", `✓ Committee C created`);
  })();

  const [cidA, cidB, cidC] = [baseId, baseId + 1, baseId + 2];
  log("SETUP", `Committee IDs — A:${cidA}  B:${cidB}  C:${cidC}`);
  log("SETUP", "Launching flows. Consensus requests staggered 90s apart.\n");

  // Run all 3 flows in parallel, but stagger their consensus requests
  const [rA, rB, rC] = await Promise.all([
    flowA(cidA, 0),          // A requests consensus immediately
    flowB(cidB, 90_000),     // B waits 90s before requesting consensus
    flowC(cidC, 180_000),    // C waits 180s before requesting consensus
  ]);

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(68));
  console.log("E2E TEST SUMMARY");
  console.log("═".repeat(68));
  console.log(`  Explorer: ${EXPLORER}/address/${CONTRACT}\n`);

  const results = [rA, rB, rC];
  let passed = 0;
  for (const r of results) {
    if (r.passed) {
      passed++;
      if (r.flow === "A")
        console.log(`  Flow A (cid ${r.cid}): ✅ PASSED — verdict: ${r.verdict}`);
      else if (r.flow === "B")
        console.log(`  Flow B (cid ${r.cid}): ✅ PASSED — verdict: ${r.verdict}, appeal: ${r.appealVerdict}`);
      else
        console.log(`  Flow C (cid ${r.cid}): ✅ PASSED — verdict: ${r.verdict}, winner: "${r.winner}"`);
    } else {
      console.log(`  Flow ${r.flow} (cid ${r.cid}): ❌ FAILED — ${r.error}`);
    }
  }

  console.log(`\n  Result: ${passed}/3 flows passed`);
  if (passed === 3) console.log("  🎉 All flows complete — contract ready for submission");
  else              console.log("  ⚠  Some flows failed — review logs above");
  console.log();
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
