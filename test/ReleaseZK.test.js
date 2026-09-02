// test/ReleaseZK.test.js
// Prueba el CABLEADO del flujo trustless con MockHonkVerifier (sin correr el
// circuito real). Cubre: happy path, replay, root desconocido, root mismatch,
// prueba inválida. Correr:  npm run test:release
import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

// El ABI de Noir para `pub [u8;32]` produce 32 campos, uno por byte del root.
function rootToPublicInputs(root) {
  const bytes = ethers.getBytes(root);
  return [...bytes].map((b) => ethers.zeroPadValue(ethers.toBeHex(b), 32));
}

describe("ReceiverZK.release", () => {
  let token, verifier, roots, receiver, user, to;
  const amount = ethers.parseUnits("100", 18);
  const id = 0n;
  const root = ethers.hexlify(ethers.randomBytes(32));

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    user = signers[1];
    to = user.address;

    token = await (await ethers.getContractFactory("GuaraniToken")).deploy(0);
    verifier = await (await ethers.getContractFactory("MockHonkVerifier")).deploy();
    roots = await (await ethers.getContractFactory("RootRegistry")).deploy();
    receiver = await (await ethers.getContractFactory("ReceiverZK")).deploy(
      token.target,
      verifier.target,
      roots.target
    );
    await token.grantRole(await token.MINTER_ROLE(), receiver.target);
  });

  it("libera fondos con prueba válida y root conocido", async () => {
    await roots.addRoot(root);
    const pub = rootToPublicInputs(root);
    await expect(receiver.release(id, to, amount, root, "0x00", pub))
      .to.emit(receiver, "Released")
      .withArgs(id, to, amount);
    expect(await token.balanceOf(to)).to.equal(amount);
    expect(await receiver.processed(id)).to.equal(true);
  });

  it("revierte por replay (mismo id dos veces)", async () => {
    await roots.addRoot(root);
    const pub = rootToPublicInputs(root);
    await receiver.release(id, to, amount, root, "0x00", pub);
    await expect(
      receiver.release(id, to, amount, root, "0x00", pub)
    ).to.be.revertedWith("ReceiverZK: replay");
  });

  it("revierte si el root no está registrado", async () => {
    const pub = rootToPublicInputs(root);
    await expect(
      receiver.release(id, to, amount, root, "0x00", pub)
    ).to.be.revertedWith("ReceiverZK: unknown root");
  });

  it("revierte si los inputs públicos no coinciden con el root", async () => {
    await roots.addRoot(root);
    const pub = rootToPublicInputs(ethers.hexlify(ethers.randomBytes(32)));
    await expect(
      receiver.release(id, to, amount, root, "0x00", pub)
    ).to.be.revertedWith("ReceiverZK: root mismatch");
  });

  it("revierte si la prueba es inválida", async () => {
    await roots.addRoot(root);
    await verifier.setResult(false);
    const pub = rootToPublicInputs(root);
    await expect(
      receiver.release(id, to, amount, root, "0x00", pub)
    ).to.be.revertedWith("ReceiverZK: bad proof");
  });
});
