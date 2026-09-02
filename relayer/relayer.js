// relayer/relayer.js  (VERSIÓN ROBUSTA)
import { ethers } from "ethers";
import fs from "fs";
import "dotenv/config";
import accountManager from "../utils/accounts.js";

const {
  RPC_URL_N1,
  RPC_URL_N2,
  PRIVATE_KEY_RELAYER,
  START_BLOCK_N1 = 0,
} = process.env;

/* ---------- providers ---------- */
const providerN1 = RPC_URL_N1?.startsWith("ws")
  ? new ethers.WebSocketProvider(RPC_URL_N1)
  : new ethers.JsonRpcProvider(RPC_URL_N1);

const providerN2 = new ethers.JsonRpcProvider(RPC_URL_N2);

const signerN2 = PRIVATE_KEY_RELAYER
? new ethers.Wallet(PRIVATE_KEY_RELAYER, providerN2)
: accountManager.getRelayerSigner(RPC_URL_N2);





/* ---------- contratos ---------- */
const senderAbi = [
    {
      "inputs": [
        {
          "internalType": "contract GuaraniToken",
          "name": "_token",
          "type": "address"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "to",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "Locked",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "recipientL2",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "lock",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "lockedBalance",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "nonce",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "token",
      "outputs": [
        {
          "internalType": "contract GuaraniToken",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ];
const receiverAbi = [
    {
      "inputs": [
        {
          "internalType": "contract GuaraniToken",
          "name": "_token",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_relayer",
          "type": "address"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "to",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "Minted",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "to",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "mintRemote",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "processed",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "relayer",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "token",
      "outputs": [
        {
          "internalType": "contract GuaraniToken",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ];

const DEPLOY_N1_FILE = "deploy-N1.json";
const DEPLOY_N2_FILE = "deploy-N2.json";

// Un redeploy reescribe deploy-N1.json/deploy-N2.json con direcciones nuevas.
// Antes solo se leían una vez al arrancar, así que el relayer seguía apuntando
// a los contratos viejos (sin logs nuevos) hasta reiniciarlo a mano. Ahora se
// detecta el cambio por mtime y se reconstruyen sender/receiver.
let sender, receiver;
let deployMtimeN1 = 0;
let deployMtimeN2 = 0;

function loadContracts() {
  const n1 = JSON.parse(fs.readFileSync(DEPLOY_N1_FILE));
  const n2 = JSON.parse(fs.readFileSync(DEPLOY_N2_FILE));
  sender = new ethers.Contract(n1.sender, senderAbi, providerN1);
  receiver = new ethers.Contract(n2.receiver, receiverAbi, signerN2);
  deployMtimeN1 = fs.statSync(DEPLOY_N1_FILE).mtimeMs;
  deployMtimeN2 = fs.statSync(DEPLOY_N2_FILE).mtimeMs;
  console.log(`   contratos (re)cargados: sender=${n1.sender} receiver=${n2.receiver}`);
}

function reloadContractsIfChanged() {
  const m1 = fs.statSync(DEPLOY_N1_FILE).mtimeMs;
  const m2 = fs.statSync(DEPLOY_N2_FILE).mtimeMs;
  if (m1 !== deployMtimeN1 || m2 !== deployMtimeN2) {
    console.log("🔄 deploy-N1.json/deploy-N2.json cambiaron, recargando contratos…");
    loadContracts();
  }
}

loadContracts();

console.log("Relayer escuchando Locked() vía polling (queryFilter)…");

// Función para manejar eventos Locked con reintentos
const handleLockedEvent = async (id, from, to, amount, retries = 3) => {
  try {
    console.log(
      `🔒  id=${id}  from=${from.substring(0, 6)}… -> ${to.substring(
        0,
        6
      )}…  amount=${ethers.formatUnits(amount, 18)}`
    );

    const tx = await receiver.mintRemote(id, to, amount);
    console.log(`⛓️   mintRemote tx: ${tx.hash}`);
    await tx.wait();
    console.log("✅  confirmado\n");
  } catch (error) {
    console.log(`❌ Error en handleLockedEvent: ${error.message}`);
    if (retries > 0) {
      console.log(`🔄 Reintentando... (${retries} intentos restantes)`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar 2s
      return handleLockedEvent(id, from, to, amount, retries - 1);
    } else {
      console.log(`💥 Error permanente para id ${id}`);
    }
  }
};

/* ---------- polling de eventos (queryFilter / eth_getLogs) ----------
 * Reemplaza sender.on()/receiver.on(): en HTTP esos listeners usan filtros
 * (eth_newFilter + eth_getFilterChanges), que expiran (Hardhat cierra el filtro
 * tras ~5 min sin bloques nuevos) y hacen que ethers tire "results is not
 * iterable". queryFilter usa eth_getLogs por rango de bloques: no expira, no se
 * pierden eventos y sobrevive reinicios del nodo.
 */
const POLL_MS = Number(process.env.POLL_MS) || 4000;

// Lee el bloque actual reintentando, por si el nodo todavia no esta listo.
async function currentBlock(provider, label) {
  for (let i = 0; ; i++) {
    try {
      return await provider.getBlockNumber();
    } catch (e) {
      if (i >= 30) throw e;
      console.log(`⏳ esperando RPC ${label}… (${e.message})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// Crea un poller que procesa los logs nuevos de `eventName` desde `startBlock`.
// Mantiene su propio cursor de bloque y evita solapar dos corridas.
// `getContract` (no el contrato directo) para no quedar con una referencia
// vieja cuando loadContracts() reasigna sender/receiver tras un redeploy.
function makePoller({ provider, getContract, eventName, startBlock, onLog, label }) {
  let next = startBlock;
  let lastHead = -1; // último head observado; distingue "esperando bloque nuevo" de "la cadena retrocedió"
  let busy = false;
  return async () => {
    if (busy) return;
    busy = true;
    try {
      reloadContractsIfChanged();
      const head = await provider.getBlockNumber();
      // Si reiniciaste las cadenas, el head vuelve a 0 pero el cursor seguía
      // apuntando al bloque viejo → sin esto el poll queda mudo para siempre.
      // OJO: comparar contra el head ANTERIOR, no contra next — en estado
      // normal (esperando el próximo bloque) head == next - 1 siempre.
      if (lastHead !== -1 && head < lastHead) {
        console.log(`🔄 ${label} retrocedió (head=${head} < último visto=${lastHead}), reseteando cursor`);
        next = startBlock;
      }
      lastHead = head;
      if (head >= next) {
        const logs = await getContract().queryFilter(eventName, next, head);
        for (const log of logs) {
          if (!log.args) continue;
          await onLog(log);
        }
        next = head + 1;
      }
    } catch (err) {
      console.log(`⚠️  poll ${label} falló (reintenta): ${err.message}`);
    } finally {
      busy = false;
    }
  };
}

// Arranque: si START_BLOCK_N1 > 0 se reprocesa desde ahi (receiver.processed(id)
// evita el doble mint); si no, solo se atienden eventos nuevos.
const head1 = await currentBlock(providerN1, "N1");
const head2 = await currentBlock(providerN2, "N2");
const startN1 = Number(START_BLOCK_N1) > 0 ? Number(START_BLOCK_N1) : head1 + 1;

const pollLocked = makePoller({
  provider: providerN1,
  getContract: () => sender,
  eventName: "Locked",
  startBlock: startN1,
  label: "Locked@N1",
  onLog: async (log) => {
    const { id, from, to, amount } = log.args;
    await handleLockedEvent(id, from, to, amount);
  },
});

const pollMinted = makePoller({
  provider: providerN2,
  getContract: () => receiver,
  eventName: "Minted",
  startBlock: head2 + 1,
  label: "Minted@N2",
  onLog: async (log) => {
    const { id, to, amount } = log.args;
    console.log(
      `💰  id=${id}  to=${to.substring(0, 6)}…  amount=${ethers.formatUnits(amount, 18)}`
    );
    console.log("SE TRANSFIRIO ( evento Minted )");
  },
});

// Errores a nivel provider (util sobre todo si algun dia pasas a WebSocket).
providerN1.on("error", (e) => console.log("🚨 Error en provider N1:", e.message));
providerN2.on("error", (e) => console.log("🚨 Error en provider N2:", e.message));

setInterval(pollLocked, POLL_MS);
setInterval(pollMinted, POLL_MS);

// Red de seguridad general (ya no hace falta el parche de "results is not iterable").
process.on("unhandledRejection", (reason) => {
  console.log("🚨 Unhandled Rejection:", reason?.message || reason);
});
process.on("uncaughtException", (error) => {
  console.log("🚨 Uncaught Exception:", error?.message || error);
});
