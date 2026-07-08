/**
 * Deploy investment_committee.py to GenLayer StudioNet.
 *
 * Usage:
 *   DEPLOY_PRIVATE_KEY=0x<your-key> node scripts/deploy.mjs
 *
 * After running, copy the printed contract address into .env.local:
 *   NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS=0x<new-address>
 * Then restart the dev server.
 */

import { createAccount, abi } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { encodeFunctionData } from "viem";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRIVATE_KEY = process.env.DEPLOY_PRIVATE_KEY;
if (!PRIVATE_KEY || !PRIVATE_KEY.startsWith("0x")) {
  console.error("Usage: DEPLOY_PRIVATE_KEY=0x<key> node scripts/deploy.mjs");
  process.exit(1);
}

const RPC = "https://studio.genlayer.com/api";

async function rpc(method, params, id = 1) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`RPC ${method} error: ${JSON.stringify(data.error)}`);
  return data.result;
}

const account = createAccount(PRIVATE_KEY);
console.log("Deploying from:", account.address);

const chain = studionet;
const consensus = chain.consensusMainContract;

const contractSource = fs.readFileSync(
  path.join(__dirname, "..", "contract", "investment_committee.py"),
  "utf8"
);
const sourceBytes = new TextEncoder().encode(contractSource);
// Second element `true` signals a deployment (not a function call)
const txData = abi.transactions.serialize([sourceBytes, true]);

const evmData = encodeFunctionData({
  abi: consensus.abi,
  functionName: "addTransaction",
  args: [
    account.address,
    "0x0000000000000000000000000000000000000000", // zero address = deploy
    chain.defaultNumberOfInitialValidators,
    chain.defaultConsensusMaxRotations,
    txData,
  ],
});

const nonceHex = await rpc("eth_getTransactionCount", [account.address, "latest"]);
const nonce = parseInt(nonceHex, 16);
const gasPriceHex = await rpc("eth_gasPrice", []);
const gasPrice = BigInt(gasPriceHex);

const signed = await account.signTransaction({
  account,
  to: consensus.address,
  data: evmData,
  type: "legacy",
  nonce,
  value: BigInt(0),
  gas: BigInt(400000),
  gasPrice,
  chainId: chain.id,
});

const txHash = await rpc("eth_sendRawTransaction", [signed], 3);
console.log("\nDeploy tx submitted:", txHash);
console.log("Explorer:", `https://explorer-studio.genlayer.com/tx/${txHash}`);
console.log("\nWait 30–60s then open the explorer link.");
console.log("Find the new contract address in the explorer under this tx.");
console.log("Then update .env.local:");
console.log("  NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS=<new-address>");
console.log("And restart the dev server: npm run dev");
