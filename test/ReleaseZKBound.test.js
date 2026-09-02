// test/ReleaseZKBound.test.js
// Fase 3 — prueba el BINDING de (recipient, amount) en ReceiverZKBound.
// Usa MockHonkVerifier para aislar la lógica del contrato: demuestra que aunque
// la prueba "verifique", un (to, amount) que no coincide con los inputs públicos
// es RECHAZADO. Correr:  npx hardhat test test/ReleaseZKBound.test.js
import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

// publicInputs Fase 3: [root(32)] [recipient(20)] [amount(32)] = 84 campos (byte por campo).
function buildPublicInputs(root, recipient, amount) {
  const rb = [...ethers.getBytes(root)];
  const rc = [...ethers.getBytes(recipient)];
  const am = [...ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(amount), 32))];
  return [...rb, ...rc, ...am].map((b) => ethers.zeroPadValue(ethers.toBeHex(b), 32));
}

describe("ReceiverZKBound.release (binding Fase 3)", () => {
  let token, verifier, roots, receiver, alice, attacker;
  const amount = ethers.parseUnits("10", 18);
  const id = 0n;
  const root = ethers.hexlify(ethers.randomBytes(32));

  beforeEach(async () => {
    const s = await ethers.getSigners();
    alice = s[1].address;
    attacker = s[2].address;

    token = await (await ethers.getContractFactory("GuaraniToken")).deploy(0);
    verifier = await (await ethers.getContractFactory("MockHonkVerifier")).deploy();
    roots = await (await ethers.getContractFactory("RootRegistry")).deploy();
    receiver = await (await ethers.getContractFactory("ReceiverZKBound")).deploy(
      token.target, verifier.target, roots.target
    );
    await token.grantRole(await token.MINTER_ROLE(), receiver.target);
    await roots.addRoot(root);
  });

  it("acuña cuando (to, amount) coinciden con la prueba", async () => {
    const pub = buildPublicInputs(root, alice, amount);
    await expect(receiver.release(id, alice, amount, root, "0x00", pub))
      .to.emit(receiver, "Released").withArgs(id, alice, amount);
    expect(await token.balanceOf(alice)).to.equal(amount);
  });

  it("RECHAZA si adulteran el destinatario (to != recipient de la prueba)", async () => {
    const pub = buildPublicInputs(root, alice, amount); // la prueba ata a Alice
    await expect(receiver.release(id, attacker, amount, root, "0x00", pub))
      .to.be.revertedWith("ReceiverZKBound: recipient mismatch");
  });

  it("RECHAZA si adulteran el monto (amount != amount de la prueba)", async () => {
    const pub = buildPublicInputs(root, alice, amount); // la prueba ata a 10 GUA
    const huge = ethers.parseUnits("1000000", 18);
    await expect(receiver.release(id, alice, huge, root, "0x00", pub))
      .to.be.revertedWith("ReceiverZKBound: amount mismatch");
  });

  it("RECHAZA si la prueba no verifica (verificador devuelve false)", async () => {
    await verifier.setResult(false);
    const pub = buildPublicInputs(root, alice, amount);
    await expect(receiver.release(id, alice, amount, root, "0x00", pub))
      .to.be.revertedWith("ReceiverZKBound: bad proof");
  });

  it("RECHAZA si el largo de publicInputs no es 84", async () => {
    const pub = buildPublicInputs(root, alice, amount).slice(0, 40);
    await expect(receiver.release(id, alice, amount, root, "0x00", pub))
      .to.be.revertedWith("ReceiverZKBound: bad public inputs len");
  });
});
