// relayer/prepareInputs.js
// Port ESM de noir-merkle/scripts/prepare_inputs.py (y frontend/src/lib/prepareInputs.ts):
// valida límites del circuito MPT y aplica padding a los tamaños fijos que exige el ABI.

export const LIMITS = {
  MAX_PROOF_NODES: 6,
  MAX_NODE_LEN: 532,
  MAX_TX_LEN: 512,
  MAX_TX_INDEX: 65536,
};

export function unhex(s) {
  const clean = s.startsWith("0x") ? s.slice(2) : s;
  if (clean.length % 2 !== 0) throw new Error(`hex de longitud impar: ${s.slice(0, 12)}...`);
  const out = [];
  for (let i = 0; i < clean.length; i += 2) {
    const b = parseInt(clean.slice(i, i + 2), 16);
    if (Number.isNaN(b)) throw new Error(`hex inválido cerca de "${clean.slice(i, i + 2)}"`);
    out.push(b);
  }
  return out;
}

export function toHex(bytes, prefix = true) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return prefix ? "0x" + s : s;
}

// Convierte un monto (string decimal, hex 0x, o number) a [u8;32] big-endian.
export function toBe32(v) {
  let n = BigInt(v);
  const out = new Array(32).fill(0);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

// Espejo de check_limits() de prepare_inputs.py.
export function checkLimits(root, txIndex, tx, nodes) {
  const errors = [];
  if (root.length !== 32) errors.push(`transactions_root debe tener 32 bytes, tiene ${root.length}`);
  if (!(txIndex >= 0 && txIndex < LIMITS.MAX_TX_INDEX)) errors.push("tx_index debe estar en [0, 65536)");
  if (!(tx.length >= 1 && tx.length <= LIMITS.MAX_TX_LEN))
    errors.push(`serialized_tx: ${tx.length} bytes (max ${LIMITS.MAX_TX_LEN})`);
  if (!(nodes.length >= 1 && nodes.length <= LIMITS.MAX_PROOF_NODES))
    errors.push(`proof_nodes: ${nodes.length} nodos (max ${LIMITS.MAX_PROOF_NODES})`);
  nodes.forEach((n, i) => {
    if (n.length > LIMITS.MAX_NODE_LEN) errors.push(`nodo ${i}: ${n.length} bytes (max ${LIMITS.MAX_NODE_LEN})`);
    if (i > 0 && n.length < 32) errors.push(`nodo ${i}: nodo embebido (<32 bytes) no soportado por el MVP`);
  });
  return errors;
}

// Espejo de build_inputs(): devuelve el objeto que consume noir.execute().
export function buildInputs(rawCase) {
  const root = unhex(rawCase.transactions_root);
  const tx = unhex(rawCase.serialized_tx);
  const nodes = rawCase.proof_nodes.map(unhex);
  const txIndex = Number(rawCase.tx_index);

  const errors = checkLimits(root, txIndex, tx, nodes);
  if (errors.length) throw new Error("inputs fuera de los límites del circuito:\n  - " + errors.join("\n  - "));

  const pad = (arr, len) => [...arr, ...new Array(len - arr.length).fill(0)];
  const padNodes = nodes.map((n) => pad(n, LIMITS.MAX_NODE_LEN));
  while (padNodes.length < LIMITS.MAX_PROOF_NODES) padNodes.push(new Array(LIMITS.MAX_NODE_LEN).fill(0));
  const nodeLens = [
    ...nodes.map((n) => n.length),
    ...new Array(LIMITS.MAX_PROOF_NODES - nodes.length).fill(0),
  ];

  const out = {
    transactions_root: root,
    tx_index: txIndex,
    serialized_tx: pad(tx, LIMITS.MAX_TX_LEN),
    tx_len: tx.length,
    proof_nodes: padNodes,
    proof_node_lens: nodeLens,
    proof_len: nodes.length,
  };

  // Fase 3 (binding): si el caso trae recipient/amount/calldata_offset, se agregan
  // como inputs del circuito con binding (ReceiverZKBound).
  if (rawCase.recipient !== undefined) {
    out.recipient = unhex(rawCase.recipient); // [u8;20]
    out.amount = toBe32(rawCase.amount); // [u8;32] big-endian
    out.calldata_offset = Number(rawCase.calldata_offset);
  }

  return out;
}
