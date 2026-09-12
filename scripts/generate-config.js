// scripts/generate-config.js
// Genera public/config.js para el frontend, según ENABLE_ZK_PROOF_WAY.
// Incluye el modo, las direcciones L1/L2, las RPC (el frontend hace sus
// propias lecturas de balance/eventos, no solo lo que ve por MetaMask) y el
// evento N2 a escuchar (Released en ZK, Minted en clásico).
import { readFileSync, writeFileSync, existsSync } from "fs";
import "dotenv/config";

const ZK = String(process.env.ENABLE_ZK_PROOF_WAY || "false") === "true";
const RPC_URL_N1 = process.env.RPC_URL_N1 || "http://127.0.0.1:8545";
const RPC_URL_N2 = process.env.RPC_URL_N2 || "http://127.0.0.1:9545";

function readJson(p) {
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

// El chainId depende de a qué RPC estás apuntando (local, Sepolia, OP Sepolia,
// etc.) — se lo preguntamos a la red en vez de asumir siempre 31337.
async function getChainIdHex(rpcUrl) {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const { result } = await res.json();
    return result || null;
  } catch {
    return null;
  }
}

async function main() {
  const n1 = readJson("deploy-N1.json");
  if (!n1?.token || !n1?.sender) {
    console.error("❌ deploy-N1.json no encontrado o inválido. Ejecutá el deploy de N1 primero.");
    process.exit(1);
  }

  const n2File = ZK ? "deploy-N2-zk.json" : "deploy-N2.json";
  const n2 = readJson(n2File);
  if (!n2?.token || !n2?.receiver) {
    console.warn(`⚠  ${n2File} no encontrado — el frontend quedará con direcciones N2 vacías.`);
  }

  const chainN1 = (await getChainIdHex(RPC_URL_N1)) || "0x7a69"; // 31337 si no responde

  const config = {
    MODE: ZK ? "zk" : "classic",
    N2_EVENT: ZK ? "Released" : "Minted",
    CHAIN_N1: chainN1,
    RPC_URL_N1,
    RPC_URL_N2,
    TOKEN_N1: n1.token,
    SENDER_N1: n1.sender,
    TOKEN_N2: n2?.token || "",
    RECEIVER_N2: n2?.receiver || "",
    GENERATED_AT: new Date().toISOString(),
  };

  const js =
    `// Auto-generado por scripts/generate-config.js — NO EDITAR A MANO\n` +
    `window.CONTRACT_CONFIG = ${JSON.stringify(config, null, 2)};\n` +
    `console.log("📄 Config (${config.MODE}):", window.CONTRACT_CONFIG);\n`;

  writeFileSync("public/config.js", js);
  console.log(`✅ public/config.js generado — modo ${config.MODE}  ·  chain N1 ${config.CHAIN_N1}`);
  console.log(`   N1  rpc ${RPC_URL_N1}  ·  token ${config.TOKEN_N1}  ·  sender ${config.SENDER_N1}`);
  console.log(`   N2  rpc ${RPC_URL_N2}  ·  token ${config.TOKEN_N2}  ·  receiver ${config.RECEIVER_N2}  ·  evento ${config.N2_EVENT}`);
}

main();
