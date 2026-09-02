// test/ReleaseBLS.test.js
// Fase 4 (diseño) — ReceiverZKBoundBLS exige DOS pruebas: MPT (inclusión + binding) y
// BLS (firma, STUB). Demuestra que, con la firma stubbeada, el binding de (recipient,
// amount) SIGUE vigente: valores adulterados revierten igual.
// Correr:  npx hardhat test test/ReleaseBLS.test.js
import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

// [root(32)] [recipient(20)] [amount(32)] = 84 campos
function buildPublicInputs(root, recipient, amount) {
  const rb = [...ethers.getBytes(root)];
  const rc = [...ethers.getBytes(recipient)];
  const am = [...ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(amount), 32))];
  return [...rb, ...rc, ...am].map((b) => ethers.zeroPadValue(ethers.toBeHex(b), 32));
}

describe("ReceiverZKBoundBLS (Fase 4: MPT + BLS stub)", () => {
  let token, txVerifier, sigVerifier, receiver, alice, attacker;
  const amount = ethers.parseUnits("10", 18);
  const id = 0n;
  const root = ethers.hexlify(ethers.randomBytes(32));
  const SIG_PROOF = "0x00";
  const SIG_PUB = [];

  beforeEach(async () => {
    const s = await ethers.getSigners();
    alice = s[1].address;
    attacker = s[2].address;

    token = await (await ethers.getContractFactory("GuaraniToken")).deploy(0);
    txVerifier = await (await ethers.getContractFactory("MockHonkVerifier")).deploy();
    sigVerifier = await (await ethers.getContractFactory("SignatureVerifierStub")).deploy();
    receiver = await (await ethers.getContractFactory("ReceiverZKBoundBLS")).deploy(
      token.target, txVerifier.target, sigVerifier.target
    );
    await token.grantRole(await token.MINTER_ROLE(), receiver.target);
  });

  it("acuña con prueba MPT válida + firma BLS (stub) y valores correctos", async () => {
    const pub = buildPublicInputs(root, alice, amount);
    await expect(receiver.release(id, alice, amount, root, "0x00", pub, SIG_PROOF, SIG_PUB))
      .to.emit(receiver, "Released").withArgs(id, alice, amount);
    expect(await token.balanceOf(alice)).to.equal(amount);
  });

  it("el binding SIGUE vigente aunque la firma esté stubbeada: destinatario adulterado revierte", async () => {
    const pub = buildPublicInputs(root, alice, amount);
    await expect(receiver.release(id, attacker, amount, root, "0x00", pub, SIG_PROOF, SIG_PUB))
      .to.be.revertedWith("ReceiverZKBoundBLS: recipient mismatch");
  });

  it("monto adulterado revierte", async () => {
    const pub = buildPublicInputs(root, alice, amount);
    const huge = ethers.parseUnits("1000000", 18);
    await expect(receiver.release(id, alice, huge, root, "0x00", pub, SIG_PROOF, SIG_PUB))
      .to.be.revertedWith("ReceiverZKBoundBLS: amount mismatch");
  });

  it("prueba MPT inválida revierte (aunque la firma pase)", async () => {
    await txVerifier.setResult(false);
    const pub = buildPublicInputs(root, alice, amount);
    await expect(receiver.release(id, alice, amount, root, "0x00", pub, SIG_PROOF, SIG_PUB))
      .to.be.revertedWith("ReceiverZKBoundBLS: bad tx proof");
  });
});
