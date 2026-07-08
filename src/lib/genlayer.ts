import { createClient, abi } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { encodeFunctionData, type Address, type Hex } from "viem";

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS ?? "") as Address;
const EXPLORER_URL = process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL ?? "https://explorer-studio.genlayer.com";

// ─── Client factory ───────────────────────────────────────────────────────────

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

// ─── Helper: wait for FINALIZED ──────────────────────────────────────────────

export async function waitForFinalized(client: ReturnType<typeof createClient>, hash: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    retries: 60,
    interval: 5000,
  });
}

// ─── Non-blocking write helper ────────────────────────────────────────────────
//
// StudioNet returns {"jsonrpc":"2.0","id":1} (no result, no error) for
// eth_getTransactionReceipt, so genlayer-js's _sendConsensusCall hangs forever
// waiting for receipt. This helper encodes the calldata and bypasses receipt
// waiting by returning the EVM tx hash immediately.
//
// Two signing paths:
//   json-rpc account (injected wallet) → eth_sendTransaction via provider
//   local account                       → signTransaction + sendRawTransaction

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

  // 1. Encode GenVM calldata → txData bytes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calldataObj = (abi.calldata.makeCalldataObject as any)(functionName, callArgs, undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encoded = (abi.calldata.encode as any)(calldataObj);
  const txData = abi.transactions.serialize([encoded, false]);

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

// ─── Read calls ───────────────────────────────────────────────────────────────

export async function getAllCommittees(client: ReturnType<typeof createClient>) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_all_committees",
    args: [],
  });
}

export async function getCommittee(client: ReturnType<typeof createClient>, committeeId: number) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_committee",
    args: [committeeId],
  });
}

export async function getCommitteeProposals(client: ReturnType<typeof createClient>, committeeId: number) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_committee_proposals",
    args: [committeeId],
  });
}

export async function getProposal(client: ReturnType<typeof createClient>, proposalId: number) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_proposal",
    args: [proposalId],
  });
}

export async function getRecommendationResult(client: ReturnType<typeof createClient>, committeeId: number) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_recommendation_result",
    args: [committeeId],
  });
}

export async function getAppeal(client: ReturnType<typeof createClient>, committeeId: number) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_appeal",
    args: [committeeId],
  });
}

export async function getCommitteesByDao(client: ReturnType<typeof createClient>, address: string) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_committees_by_dao",
    args: [address],
  });
}

export async function getProposalsByProposer(client: ReturnType<typeof createClient>, address: string) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_proposals_by_proposer",
    args: [address],
  });
}

// ─── Write calls ──────────────────────────────────────────────────────────────

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

