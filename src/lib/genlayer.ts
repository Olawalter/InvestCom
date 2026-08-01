import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { encodeFunctionData, toHex, toRlp, fromHex, type Address, type Hex } from "viem";

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS ?? "") as Address;
const EXPLORER_URL = process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL ?? "https://explorer-studio.genlayer.com";
const GL_RPC = "https://studio.genlayer.com/api";

// ── GenLayer calldata encoder (inline, no genlayer-js import) ─────────────────
// Replicates genlayer-js abi.calldata.encode + abi.transactions.serialize using
// the same type constants so the encoder lives in application code (not the
// vendor chunk) and is always rebuilt fresh by Next.js.
const _T = { SPECIAL: 0, PINT: 1, NINT: 2, BYTES: 3, STR: 4, ARR: 5, MAP: 6 };
const _BITS = 3;

function _writeVarInt(out: number[], n: bigint) {
  if (n === BigInt(0)) { out.push(0); return; }
  while (n > BigInt(0)) {
    let b = Number(n & BigInt(0x7f));
    n >>= BigInt(7);
    if (n > BigInt(0)) b |= 128;
    out.push(b);
  }
}
function _encodeVal(out: number[], v: unknown) {
  if (v === null || v === undefined) { out.push(0); return; }
  if (typeof v === "boolean") {
    out.push(v ? (2 << _BITS) | _T.SPECIAL : (1 << _BITS) | _T.SPECIAL);
    return;
  }
  if (typeof v === "number") {
    const n = BigInt(Math.trunc(v));
    n >= BigInt(0) ? _writeVarInt(out, (n << BigInt(_BITS)) | BigInt(_T.PINT))
                   : _writeVarInt(out, ((-n - BigInt(1)) << BigInt(_BITS)) | BigInt(_T.NINT));
    return;
  }
  if (typeof v === "string") {
    const bytes = new TextEncoder().encode(v);
    _writeVarInt(out, (BigInt(bytes.length) << BigInt(_BITS)) | BigInt(_T.STR));
    for (const b of bytes) out.push(b);
    return;
  }
  if (Array.isArray(v)) {
    _writeVarInt(out, (BigInt(v.length) << BigInt(_BITS)) | BigInt(_T.ARR));
    for (const item of v) _encodeVal(out, item);
    return;
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    _writeVarInt(out, (BigInt(entries.length) << BigInt(_BITS)) | BigInt(_T.MAP));
    for (const [k, val] of entries) {
      _encodeVal(out, k);
      _encodeVal(out, val);
    }
    return;
  }
}

function _glEncode(method: string, args: unknown[]): string {
  const obj: Record<string, unknown> = { method };
  if (args.length > 0) obj.args = args;
  const out: number[] = [];
  _encodeVal(out, obj);
  // serialize([encoded_bytes, false]) = toRlp([toHex(bytes), toHex(false)])
  return toRlp([toHex(new Uint8Array(out)), toHex(false)]);
}

// ── GenLayer result decoder (inline) ─────────────────────────────────────────
// Mirrors genlayer-js abi.calldata.decode so the decoder is also fresh-bundled.
function _readVarInt(buf: Uint8Array, pos: number): [bigint, number] {
  let result = BigInt(0), shift = BigInt(0);
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    shift += BigInt(7);
    if ((b & 0x80) === 0) break;
  }
  return [result, pos];
}
function _decodeVal(buf: Uint8Array, pos: number): [unknown, number] {
  let tag: bigint;
  [tag, pos] = _readVarInt(buf, pos);
  const type = Number(tag & BigInt(7));
  const payload = tag >> BigInt(_BITS);
  switch (type) {
    case _T.SPECIAL: {
      const v = Number(payload);
      return [v === 0 ? null : v === 1 ? false : v === 2 ? true : null, pos];
    }
    case _T.PINT:  return [Number(payload), pos];
    case _T.NINT:  return [-Number(payload) - 1, pos];
    case _T.BYTES: {
      const len = Number(payload);
      return [buf.slice(pos, pos + len), pos + len];
    }
    case _T.STR: {
      const len = Number(payload);
      return [new TextDecoder().decode(buf.slice(pos, pos + len)), pos + len];
    }
    case _T.ARR: {
      const len = Number(payload);
      const arr: unknown[] = [];
      for (let i = 0; i < len; i++) {
        let v: unknown; [v, pos] = _decodeVal(buf, pos); arr.push(v);
      }
      return [arr, pos];
    }
    case _T.MAP: {
      const len = Number(payload);
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < len; i++) {
        let k: unknown, v: unknown;
        [k, pos] = _decodeVal(buf, pos);
        [v, pos] = _decodeVal(buf, pos);
        obj[String(k)] = v;
      }
      return [obj, pos];
    }
    default: return [null, pos];
  }
}
function _glDecode(hex: string): unknown {
  const bytes = fromHex(hex as Hex, "bytes");
  const [val] = _decodeVal(bytes, 0);
  return val;
}

// ── Direct read ───────────────────────────────────────────────────────────────
async function directRead(functionName: string, args: unknown[] = []): Promise<unknown> {
  const data = _glEncode(functionName, args);
  const res = await fetch(GL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "gen_call",
      params: [{
        type: "read",
        to: CONTRACT_ADDRESS,
        from: "0x0000000000000000000000000000000000000000",
        data,
        transaction_hash_variant: "latest-nonfinal",
      }],
    }),
  });
  const json = await res.json() as { result?: string; error?: { code: number; message: string } };
  if (json.error) throw new Error(json.error.message);
  return _glDecode(json.result as string);
}

// â”€â”€â”€ Client factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Creates a genlayer client backed by an injected EVM wallet.
 * - Signed writes: pass the connected address + EIP-1193 provider.
 * - Read-only: call with no arguments.
 */
export function getClient(address?: string, provider?: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg: Record<string, unknown> = { chain: studionet };
  if (address !== undefined) cfg.account = address;
  if (provider !== undefined) cfg.provider = provider;
  return createClient(cfg as Parameters<typeof createClient>[0]);
}

export function explorerTxUrl(hash: string) {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function explorerContractUrl() {
  return `${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`;
}

// â”€â”€â”€ Helper: wait for FINALIZED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function waitForFinalized(client: ReturnType<typeof createClient>, hash: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    retries: 60,
    interval: 5000,
  });
}

// â”€â”€â”€ Non-blocking write helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// StudioNet returns {"jsonrpc":"2.0","id":1} (no result, no error) for
// eth_getTransactionReceipt, so genlayer-js's _sendConsensusCall hangs forever
// waiting for receipt. This helper encodes the calldata and bypasses receipt
// waiting by returning the EVM tx hash immediately.
//
// Two signing paths:
//   json-rpc account (injected wallet) â†’ eth_sendTransaction via provider
//   local account                       â†’ signTransaction + sendRawTransaction

async function sendWrite(
  client: ReturnType<typeof createClient>,
  functionName: string,
  callArgs: unknown[],
  value: bigint = BigInt(0)
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cl = client as any;
  const account = cl.account;
  if (!account) throw new Error("No account connected. Connect wallet first.");

  const chain = studionet;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consensus = (chain as any).consensusMainContract as { address: string; abi: unknown[] };
  const consensusAddr = consensus.address as Address;

  // 1. Encode GenVM calldata â†’ txData bytes (inline encoder, bypasses stale vendor chunk)
  const txData = _glEncode(functionName, callArgs);

  // 2. Encode EVM addTransaction call
  const evmData = encodeFunctionData({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abi: consensus.abi as any,
    functionName: "addTransaction",
    args: [
      account.address as Address,
      CONTRACT_ADDRESS,
      chain.defaultNumberOfInitialValidators,
      chain.defaultConsensusMaxRotations,
      txData as Hex,
    ],
  });

  // 3. Gas estimate with 5s timeout + 200k fallback
  let gas = BigInt(200000);
  try {
    const gasPromise = cl.estimateTransactionGas({ from: account.address, to: consensusAddr, data: evmData, value });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("gas estimation timeout")), 5000)
    );
    gas = await Promise.race([gasPromise, timeoutPromise]);
    console.log("[sendWrite] gas estimate:", gas.toString());
  } catch (e) {
    console.warn("[sendWrite] gas estimation failed, using 200k fallback:", (e as Error).message);
  }

  // Injected wallet: provider (MetaMask, Rabby, etc.) signs and broadcasts.
  // viem normalises an address string into { type: "json-rpc" }, so this is
  // always the correct path when a wallet is connected.
  if (account.type !== "json-rpc") {
    throw new Error("Only injected EVM wallets are supported. Connect MetaMask, Rabby, or a compatible wallet.");
  }

  console.log("[sendWrite] sending eth_sendTransaction via injected provider");
  const txHash = await cl.request({
    method: "eth_sendTransaction",
    params: [{
      from: account.address as string,
      to: consensusAddr,
      data: evmData,
      gas: `0x${gas.toString(16)}`,
      ...(value > BigInt(0) ? { value: `0x${value.toString(16)}` } : {}),
    }],
  });
  console.log("[sendWrite] txHash:", txHash);
  return txHash as string;
}

// â”€â”€â”€ Read calls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getAllCommittees(_client: ReturnType<typeof createClient>) {
  return directRead("get_all_committees");
}

export async function getCommittee(_client: ReturnType<typeof createClient>, committeeId: number) {
  return directRead("get_committee", [committeeId]);
}

export async function getCommitteeProposals(_client: ReturnType<typeof createClient>, committeeId: number) {
  return directRead("get_committee_proposals", [committeeId]);
}

export async function getProposal(_client: ReturnType<typeof createClient>, proposalId: number) {
  return directRead("get_proposal", [proposalId]);
}

export async function getRecommendationResult(_client: ReturnType<typeof createClient>, committeeId: number) {
  return directRead("get_recommendation_result", [committeeId]);
}

export async function getAppeal(_client: ReturnType<typeof createClient>, committeeId: number) {
  return directRead("get_appeal", [committeeId]);
}

export async function getCommitteesByDao(_client: ReturnType<typeof createClient>, address: string) {
  return directRead("get_committees_by_dao", [address]);
}

export async function getProposalsByProposer(_client: ReturnType<typeof createClient>, address: string) {
  return directRead("get_proposals_by_proposer", [address]);
}

// â”€â”€â”€ Write calls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function createCommittee(
  client: ReturnType<typeof createClient>,
  args: {
    dao_name: string;
    treasury_objective: string;
    risk_appetite: string;
    liquidity_requirement: string;
    max_single_asset_exposure_bps: number;
    max_protocol_exposure_bps: number;
    allowed_asset_classes: string[];
    disallowed_assets: string[];
    governance_constraints: string;
    evaluation_weights: Record<string, number>;
    proposal_deadline: number;
    appeal_window: number;
  }
) {
  return sendWrite(client, "create_committee", [
    args.dao_name,
    args.treasury_objective,
    args.risk_appetite,
    args.liquidity_requirement,
    args.max_single_asset_exposure_bps,
    args.max_protocol_exposure_bps,
    args.allowed_asset_classes,
    args.disallowed_assets,
    args.governance_constraints,
    args.evaluation_weights,
    args.proposal_deadline,
    args.appeal_window,
  ]);
}

export async function openCommittee(client: ReturnType<typeof createClient>, committeeId: number) {
  return sendWrite(client, "open_committee", [committeeId]);
}

export async function closeProposals(client: ReturnType<typeof createClient>, committeeId: number) {
  return sendWrite(client, "close_proposals", [committeeId]);
}

export async function cancelCommittee(client: ReturnType<typeof createClient>, committeeId: number) {
  return sendWrite(client, "cancel_committee", [committeeId]);
}

export async function submitProposal(
  client: ReturnType<typeof createClient>,
  committeeId: number,
  args: {
    title: string;
    summary: string;
    asset_or_strategy: string;
    allocation_bps: number;
    expected_holding_period: string;
    liquidity_profile: string;
    risk_thesis: string;
    fundamental_thesis: string;
    governance_risks: string;
    evidence_urls: string[];
  }
) {
  return sendWrite(client, "submit_proposal", [
    committeeId,
    args.title,
    args.summary,
    args.asset_or_strategy,
    args.allocation_bps,
    args.expected_holding_period,
    args.liquidity_profile,
    args.risk_thesis,
    args.fundamental_thesis,
    args.governance_risks,
    args.evidence_urls,
  ]);
}

export async function reviseProposal(
  client: ReturnType<typeof createClient>,
  proposalId: number,
  args: {
    title: string;
    summary: string;
    asset_or_strategy: string;
    allocation_bps: number;
    expected_holding_period: string;
    liquidity_profile: string;
    risk_thesis: string;
    fundamental_thesis: string;
    governance_risks: string;
    evidence_urls: string[];
  }
) {
  return sendWrite(client, "revise_proposal", [
    proposalId,
    args.title,
    args.summary,
    args.asset_or_strategy,
    args.allocation_bps,
    args.expected_holding_period,
    args.liquidity_profile,
    args.risk_thesis,
    args.fundamental_thesis,
    args.governance_risks,
    args.evidence_urls,
  ]);
}

export async function requestRecommendation(client: ReturnType<typeof createClient>, committeeId: number) {
  return sendWrite(client, "request_recommendation", [committeeId]);
}

export async function fileAppeal(
  client: ReturnType<typeof createClient>,
  committeeId: number,
  basis: string,
  statement: string,
  evidenceUrls: string[]
) {
  return sendWrite(client, "file_appeal", [committeeId, basis, statement, evidenceUrls]);
}

export async function requestAppealReview(client: ReturnType<typeof createClient>, committeeId: number) {
  return sendWrite(client, "request_appeal_review", [committeeId]);
}

export async function finalizeRecommendation(client: ReturnType<typeof createClient>, committeeId: number) {
  return sendWrite(client, "finalize_recommendation", [committeeId]);
}



