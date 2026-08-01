/**
 * Cancel a specific committee by ID.
 * Usage: E2E_KEY_DAO=0x<key> node scripts/cancel_committee.mjs <committeeId>
 */
import { createAccount, abi } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { encodeFunctionData } from "viem";

const CONTRACT = "0x848ceD2E9e07d69DA133cd425c643B41E43fBf18";
const RPC      = "https://studio.genlayer.com/api";
const cid      = Number(process.argv[2]);

if (!cid) { console.error("Usage: E2E_KEY_DAO=0x<key> node scripts/cancel_committee.mjs <id>"); process.exit(1); }
const key = process.env.E2E_KEY_DAO;
if (!key) { console.error("Missing E2E_KEY_DAO"); process.exit(1); }

const dao = createAccount(key);
console.log(`Cancelling committee #${cid} from ${dao.address}`);

async function jsonRpc(method, params) {
  const r = await fetch(RPC, { method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({jsonrpc:"2.0",id:1,method,params}) });
  const d = await r.json();
  if (d.error) throw new Error(JSON.stringify(d.error));
  return d.result;
}

const chain = studionet;
const consensus = chain.consensusMainContract;
const calldataObj = abi.calldata.makeCalldataObject("cancel_committee", [cid], {});
const encoded = abi.calldata.encode(calldataObj);
const txData  = abi.transactions.serialize([encoded, false]);
const evmData = encodeFunctionData({
  abi: consensus.abi, functionName: "addTransaction",
  args: [dao.address, CONTRACT, chain.defaultNumberOfInitialValidators, chain.defaultConsensusMaxRotations, txData],
});

const nonce    = parseInt(await jsonRpc("eth_getTransactionCount", [dao.address, "latest"]), 16);
const gasPrice = BigInt(await jsonRpc("eth_gasPrice", []));
const signed   = await dao.signTransaction({
  account: dao, to: consensus.address, data: evmData,
  type: "legacy", nonce, value: BigInt(0), gas: BigInt(200000), gasPrice, chainId: chain.id,
});
const txHash = await jsonRpc("eth_sendRawTransaction", [signed]);
console.log(`tx: https://explorer-studio.genlayer.com/tx/${txHash}`);
console.log("Waiting for receipt...");
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 4000));
  const r = await jsonRpc("eth_getTransactionReceipt", [txHash]).catch(() => null);
  if (r) { console.log(`✓ Done — status: ${r.status}`); break; }
  process.stdout.write(".");
}
