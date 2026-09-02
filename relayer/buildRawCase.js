// relayer/buildRawCase.js
// Port ESM de noir-merkle/scripts/fetch_real_block.py (re-serialización de txs +
// verificación del trie) aplicado a un lock EN VIVO en N1, en vez de un bloque
// bajado de un RPC público. Cierra la Fase 2 "deep": antes el relayer solo podía
// probar el fixture de demo (relayer/sample-rawcase.json); ahora arma la prueba
// de inclusión MPT real del bloque donde entró CADA lock.
//
// Solo tx legacy / EIP-2930 / EIP-1559 (type 0/1/2) — lo único que emite un nodo
// Hardhat local. type 3 (blob) / type 4 (7702) no aplican a L1/L2 de prueba y no
// se soportan (mismo alcance que el resto del relayer, pensado para este bridge).
import { ethers } from "ethers";
import { buildTxTrie, rlpEncodeInt } from "./trie.js";

const LOCK_SELECTOR = ethers.id("lock(address,uint256)").slice(0, 10); // "0x282d3fdf"

const q = (x) => BigInt(x);

// int -> hex mínimo big-endian ("0x" para 0), como to_b() de fetch_real_block.py.
function toBHex(n) {
  if (n === 0n) return "0x";
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return "0x" + hex;
}

function dataHex(x) {
  return x && x !== "0x" && x !== "0x0" ? x : "0x";
}

function addrHex(x) {
  return x && x !== "0x" ? x : "0x";
}

function yParity(tx) {
  return q(tx.yParity !== undefined ? tx.yParity : tx.v);
}

function encAccessList(al) {
  return (al || []).map((e) => [addrHex(e.address), (e.storageKeys || []).map((k) => k)]);
}

// Espejo de encode_tx() de fetch_real_block.py, para type 0/1/2.
function encodeTx(tx) {
  const t = tx.type ? Number(q(tx.type)) : 0;
  const to = tx.to;

  if (t === 0) {
    return ethers.encodeRlp([
      toBHex(q(tx.nonce)), toBHex(q(tx.gasPrice)), toBHex(q(tx.gas)),
      addrHex(to), toBHex(q(tx.value)), dataHex(tx.input),
      toBHex(q(tx.v)), toBHex(q(tx.r)), toBHex(q(tx.s)),
    ]);
  }
  if (t === 1) {
    const body = ethers.encodeRlp([
      toBHex(q(tx.chainId)), toBHex(q(tx.nonce)), toBHex(q(tx.gasPrice)),
      toBHex(q(tx.gas)), addrHex(to), toBHex(q(tx.value)), dataHex(tx.input),
      encAccessList(tx.accessList), toBHex(yParity(tx)), toBHex(q(tx.r)), toBHex(q(tx.s)),
    ]);
    return "0x01" + body.slice(2);
  }
  if (t === 2) {
    const body = ethers.encodeRlp([
      toBHex(q(tx.chainId)), toBHex(q(tx.nonce)), toBHex(q(tx.maxPriorityFeePerGas)),
      toBHex(q(tx.maxFeePerGas)), toBHex(q(tx.gas)), addrHex(to), toBHex(q(tx.value)),
      dataHex(tx.input), encAccessList(tx.accessList),
      toBHex(yParity(tx)), toBHex(q(tx.r)), toBHex(q(tx.s)),
    ]);
    return "0x02" + body.slice(2);
  }
  throw new Error(`buildRawCase: tipo de tx no soportado (${t}) — solo legacy/EIP-2930/EIP-1559`);
}

function hexIndexOf(haystackHex, needleHex) {
  const hay = Buffer.from(haystackHex.slice(2), "hex");
  const needle = Buffer.from(needleHex.slice(2), "hex");
  return hay.indexOf(needle);
}

/// Arma el rawCase MPT del bloque L1 donde entró `txHash` (debe ser un lock()
/// al Sender). Verifica que el transactionsRoot reconstruido coincida con el
/// header antes de devolver nada — si no coincide, revienta en vez de emitir
/// una prueba que el circuito rechazaría igual.
export async function buildRawCase(providerN1, txHash) {
  const txInfo = await providerN1.send("eth_getTransactionByHash", [txHash]);
  if (!txInfo || !txInfo.blockNumber) throw new Error(`buildRawCase: tx ${txHash} sin minar todavía`);

  const block = await providerN1.send("eth_getBlockByNumber", [txInfo.blockNumber, true]);
  const txs = block.transactions;
  const targetIndex = Number(q(txInfo.transactionIndex));

  const raw = txs.map(encodeTx);
  const trie = buildTxTrie(raw);
  const headerRoot = block.transactionsRoot.toLowerCase();
  if (trie.root.toLowerCase() !== headerRoot) {
    throw new Error(
      `buildRawCase: transactionsRoot reconstruido (${trie.root}) no coincide con el header ` +
        `(${headerRoot}) — probablemente un tipo de tx no soportado en el bloque #${block.number}.`
    );
  }

  const proof = trie.prove(rlpEncodeInt(targetIndex));
  const serializedTx = raw[targetIndex];

  // El lock() ES la tx: decodificamos recipient/amount de su propio calldata
  // (no del evento) para no depender de un dato que después hay que re-probar.
  const calldata = dataHex(txs[targetIndex].input);
  if (calldata.slice(0, 10).toLowerCase() !== LOCK_SELECTOR)
    throw new Error(`buildRawCase: tx ${txHash} no es un lock(address,uint256) (selector distinto)`);
  const recipient = "0x" + calldata.slice(34, 74); // salteo selector(4B) + 12B de padding
  const amount = q("0x" + calldata.slice(74, 138)).toString();

  const calldataOffset = hexIndexOf(serializedTx, calldata);
  if (calldataOffset < 0) throw new Error("buildRawCase: no encontré el calldata dentro de la tx serializada");

  return {
    transactions_root: trie.root,
    tx_index: targetIndex,
    serialized_tx: serializedTx,
    proof_nodes: proof,
    recipient,
    amount,
    calldata_offset: calldataOffset,
  };
}
