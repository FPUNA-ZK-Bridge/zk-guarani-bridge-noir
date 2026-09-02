// relayer/trie.js
// Port ESM de noir-merkle/scripts/trie.py: Merkle Patricia Trie de transacciones
// (off-chain) para construir transactionsRoot y pruebas de inclusión. RLP y
// keccak256 los da ethers (encodeRlp implementa las mismas reglas que rlp_encode
// de trie.py — short-string, list header, etc. — verificado a mano); el resto
// (hex-prefix encoding, construcción recursiva del trie) es un port directo.
import { ethers } from "ethers";

function toNibbles(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = [];
  for (const c of clean) out.push(parseInt(c, 16));
  return out;
}

function nibblesToHex(nibs) {
  let s = "0x";
  for (let i = 0; i < nibs.length; i += 2) s += nibs[i].toString(16) + (nibs[i + 1] ?? 0).toString(16);
  return s;
}

// Espejo de hp_encode(nibbles, is_leaf) de trie.py.
function hpEncode(nibbles, isLeaf) {
  const flag = isLeaf ? 2 : 0;
  const nibs = nibbles.length % 2 === 1 ? [flag + 1, ...nibbles] : [flag, 0, ...nibbles];
  return nibblesToHex(nibs);
}

// Espejo de hp_decode_path(hp) de trie.py.
function hpDecodePath(hpHex) {
  const nibs = toNibbles(hpHex);
  const flag = nibs[0];
  return flag === 1 || flag === 3 ? nibs.slice(1) : nibs.slice(2);
}

function compareNibbles(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

function rlpByteLen(hex) {
  return (hex.length - 2) / 2;
}

// Espejo de rlp_encode_int(n) de trie.py: RLP de un entero no negativo
// (big-endian mínimo, sin ceros a la izquierda).
export function rlpEncodeInt(n) {
  if (n === 0) return ethers.encodeRlp("0x");
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return ethers.encodeRlp("0x" + hex);
}

// Espejo de la clase Trie de trie.py.
export class Trie {
  constructor(items) {
    const pairs = items.map(([k, v]) => [toNibbles(k), v]).sort((a, b) => compareNibbles(a[0], b[0]));
    this.byHash = new Map();
    if (pairs.length === 0) {
      this.rootNode = null;
      this.root = ethers.keccak256(ethers.encodeRlp("0x"));
      return;
    }
    this.rootNode = this._build(pairs);
    this.root = ethers.keccak256(ethers.encodeRlp(this.rootNode));
  }

  _build(pairs) {
    let node;
    if (pairs.length === 1) {
      const [nibs, value] = pairs[0];
      node = [hpEncode(nibs, true), value];
    } else {
      const first = pairs[0][0];
      let prefixLen = first.length;
      for (const [nibs] of pairs.slice(1)) {
        let common = 0;
        while (common < Math.min(prefixLen, nibs.length) && nibs[common] === first[common]) common++;
        prefixLen = Math.min(prefixLen, common);
      }
      if (prefixLen > 0) {
        const child = this._build(pairs.map(([nibs, v]) => [nibs.slice(prefixLen), v]));
        node = [hpEncode(first.slice(0, prefixLen), false), this._ref(child)];
      } else {
        const groups = new Map();
        for (const [nibs, v] of pairs) {
          // Las claves son RLP(i): prefix-free, nunca se agota un nibs en un branch.
          const head = nibs[0];
          if (!groups.has(head)) groups.set(head, []);
          groups.get(head).push([nibs.slice(1), v]);
        }
        node = new Array(17).fill("0x");
        for (const [nib, group] of groups) node[nib] = this._ref(this._build(group));
        node[16] = "0x";
      }
    }
    this.byHash.set(ethers.keccak256(ethers.encodeRlp(node)), node);
    return node;
  }

  _ref(node) {
    const encoded = ethers.encodeRlp(node);
    return rlpByteLen(encoded) < 32 ? node : ethers.keccak256(encoded);
  }

  // Prueba de inclusión: [nodos RLP hex] desde la raíz hasta la hoja.
  prove(keyHex) {
    let nibs = toNibbles(keyHex);
    const proof = [];
    let node = this.rootNode;
    for (;;) {
      proof.push(ethers.encodeRlp(node));
      if (node.length === 17) {
        if (nibs.length === 0) throw new Error("clave agotada en un branch");
        const ref = node[nibs[0]];
        if (ref === "0x") throw new Error("la clave no existe en el trie");
        nibs = nibs.slice(1);
        node = this._resolve(ref);
      } else {
        const flag = toNibbles(node[0])[0];
        const path = hpDecodePath(node[0]);
        if (flag >= 2) {
          if (compareNibbles(nibs, path) !== 0 || nibs.length !== path.length)
            throw new Error("la clave no coincide con la hoja");
          return proof;
        }
        if (compareNibbles(nibs.slice(0, path.length), path) !== 0)
          throw new Error("la clave no coincide con la extensión");
        nibs = nibs.slice(path.length);
        node = this._resolve(node[1]);
      }
    }
  }

  _resolve(ref) {
    if (Array.isArray(ref)) throw new Error("nodo embebido en el camino: no soportado por el MVP");
    const node = this.byHash.get(ref);
    if (!node) throw new Error(`nodo no encontrado para hash ${ref}`);
    return node;
  }
}

// Espejo de build_tx_trie(txs) de trie.py: clave RLP(i), valor = tx serializada.
export function buildTxTrie(serializedTxs) {
  return new Trie(serializedTxs.map((tx, i) => [rlpEncodeInt(i), tx]));
}
