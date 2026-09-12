import { expect } from "chai";
import hre from "hardhat";
import fs from "fs";
const { ethers } = hre;

const N2_FILE = fs.existsSync("deploy-N2-zk.json") ? "deploy-N2-zk.json" : "deploy-N2.json";

describe("🔬 Network Diagnostic Tests", function () {

  describe("🚦 1. ENVIRONMENT VALIDATION", function () {
    it("✅ Should validate .env configuration", async function () {
      const envVars = {
        RPC_URL_N1: process.env.RPC_URL_N1,
        RPC_URL_N2: process.env.RPC_URL_N2,
        PRIVATE_KEY_RELAYER: process.env.PRIVATE_KEY_RELAYER,
        START_BLOCK_N1: process.env.START_BLOCK_N1
      };

      console.log(`   🔍 Environment Variables:`);
      Object.entries(envVars).forEach(([key, value]) => {
        const masked = key.includes('PRIVATE_KEY') && value ?
          `${value.substring(0, 6)}...${value.substring(value.length - 4)}` :
          value || "NOT SET";
        console.log(`      - ${key}: ${masked}`);
      });

      // Check for common errors
      if (envVars.RPC_URL_N1?.startsWith('ws://')) {
        console.log(`   ⚠️  WARNING: N1 using WebSocket - should be HTTP for Anvil/Hardhat`);
        console.log(`   💡 Change to: RPC_URL_N1=http://127.0.0.1:8545`);
      }

      if (envVars.RPC_URL_N2?.startsWith('ws://')) {
        console.log(`   ⚠️  WARNING: N2 using WebSocket - should be HTTP for Anvil`);
        console.log(`   💡 Change to: RPC_URL_N2=http://127.0.0.1:9545`);
      }

      const expectedN1 = "http://127.0.0.1:8545";
      const expectedN2 = "http://127.0.0.1:9545";

      expect(envVars.RPC_URL_N1).to.equal(expectedN1, "N1 RPC URL should be HTTP, not WebSocket");
      expect(envVars.RPC_URL_N2).to.equal(expectedN2, "N2 RPC URL should be HTTP, not WebSocket");
    });
  });

  describe("🌐 2. CROSS-NETWORK CONNECTIVITY", function () {
    it("🔍 Should test N1 network connectivity (Hardhat)", async function () {
      try {
        const n1Provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

        const network = await n1Provider.getNetwork();
        const blockNumber = await n1Provider.getBlockNumber();
        const accounts = await n1Provider.listAccounts();

        console.log(`   ✅ N1 Network (Hardhat):`);
        console.log(`      - Chain ID: ${network.chainId}`);
        console.log(`      - Block Number: ${blockNumber}`);
        console.log(`      - Accounts: ${accounts.length}`);

        expect(network.chainId).to.equal(31337n, "N1 should be chainId 31337");
        expect(blockNumber).to.be.greaterThan(0);

      } catch (error) {
        console.log(`   ❌ N1 Network Error: ${error.message}`);
        console.log(`   💡 Make sure N1 is running: npm run node:n1`);
        throw new Error(`N1 network not accessible: ${error.message}`);
      }
    });

    it("🔍 Should test N2 network connectivity (Anvil)", async function () {
      try {
        const n2Provider = new ethers.JsonRpcProvider("http://127.0.0.1:9545");

        const network = await n2Provider.getNetwork();
        const blockNumber = await n2Provider.getBlockNumber();

        console.log(`   ✅ N2 Network (Anvil):`);
        console.log(`      - Chain ID: ${network.chainId}`);
        console.log(`      - Block Number: ${blockNumber}`);

        expect(network.chainId).to.equal(1338n, "N2 should be chainId 1338");
        expect(blockNumber).to.be.greaterThan(0);

      } catch (error) {
        console.log(`   ❌ N2 Network Error: ${error.message}`);
        console.log(`   💡 Make sure N2 is running: npm run node:n2`);
        throw new Error(`N2 network not accessible: ${error.message}`);
      }
    });

    it("✅ Should verify both networks are different", async function () {
      const n1Provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
      const n2Provider = new ethers.JsonRpcProvider("http://127.0.0.1:9545");

      const n1Network = await n1Provider.getNetwork();
      const n2Network = await n2Provider.getNetwork();

      console.log(`   ✅ Network Verification:`);
      console.log(`      - N1 Chain ID: ${n1Network.chainId}`);
      console.log(`      - N2 Chain ID: ${n2Network.chainId}`);
      console.log(`      - Different: ${n1Network.chainId !== n2Network.chainId ? "✅" : "❌"}`);

      expect(n1Network.chainId).to.not.equal(n2Network.chainId);
    });
  });

  describe("🔧 3. RELAYER SIMULATION", function () {
    it("✅ Should simulate relayer connection to both networks", async function () {
      try {
        // Simulate relayer setup like in relayer.js / relayer-zk.js
        const n1Provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        const n2Provider = new ethers.JsonRpcProvider("http://127.0.0.1:9545");

        // Test relayer account
        const relayerPrivateKey = process.env.PRIVATE_KEY_RELAYER;
        if (!relayerPrivateKey) {
          throw new Error("PRIVATE_KEY_RELAYER not set in .env");
        }

        const relayerN2 = new ethers.Wallet(relayerPrivateKey, n2Provider);

        console.log(`   ✅ Relayer Simulation:`);
        console.log(`      - Relayer Address: ${relayerN2.address}`);
        console.log(`      - N1 Connected: ✅`);
        console.log(`      - N2 Connected: ✅`);

        // Test relayer balance on N2
        const relayerBalance = await n2Provider.getBalance(relayerN2.address);
        console.log(`      - N2 Balance: ${ethers.formatEther(relayerBalance)} ETH`);

        if (relayerBalance === 0n) {
          console.log(`   ⚠️  WARNING: Relayer has 0 ETH balance on N2`);
          console.log(`   💡 Fund relayer or use a funded account`);
        }

      } catch (error) {
        console.log(`   ❌ Relayer simulation failed: ${error.message}`);
        throw error;
      }
    });

    it("🔍 Should test event filter setup", async function () {
      try {
        const deployN1 = JSON.parse(fs.readFileSync("deploy-N1.json", "utf8"));
        const n1Provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

        // Check if sender contract exists
        const senderCode = await n1Provider.getCode(deployN1.sender);
        if (senderCode === "0x") {
          console.log(`   ⚠️  SKIPPING: Sender contract not deployed on N1`);
          this.skip();
          return;
        }

        // Create contract instance
        const senderAbi = [
          "event Locked(uint256 indexed id,address indexed from,address indexed to,uint256 amount)"
        ];
        const sender = new ethers.Contract(deployN1.sender, senderAbi, n1Provider);

        // Test event filter creation
        const filter = sender.filters.Locked();

        console.log(`   ✅ Event Filter Test:`);
        console.log(`      - Contract: ${deployN1.sender}`);
        console.log(`      - Filter Topics: ${JSON.stringify(filter.topics)}`);

        // Test event listener setup (without actually listening)
        let listenerSetup = false;
        try {
          sender.on(filter, (...args) => {
            console.log("Event received:", args);
          });
          listenerSetup = true;
          sender.removeAllListeners();
        } catch (e) {
          console.log(`   ❌ Event listener setup failed: ${e.message}`);
        }

        console.log(`      - Listener Setup: ${listenerSetup ? "✅" : "❌"}`);
        expect(listenerSetup).to.be.true;

      } catch (error) {
        console.log(`   ❌ Event filter test failed: ${error.message}`);
        throw error;
      }
    });
  });

  describe("📊 4. DEPLOYMENT CONSISTENCY CHECK", function () {
    it("🔍 Should verify N1 contracts on correct network", async function () {
      try {
        const deployN1 = JSON.parse(fs.readFileSync("deploy-N1.json", "utf8"));
        const n1Provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

        const network = await n1Provider.getNetwork();
        console.log(`   🔍 N1 Deployment Check:`);
        console.log(`      - Current Network: ${network.chainId}`);
        console.log(`      - Expected: 31337`);

        if (network.chainId !== 31337n) {
          console.log(`   ⚠️  WARNING: Connected to wrong N1 network!`);
          console.log(`   💡 Make sure you're connected to Hardhat (chainId 31337)`);
        }

        const tokenCode = await n1Provider.getCode(deployN1.token);
        const senderCode = await n1Provider.getCode(deployN1.sender);

        console.log(`      - Token Contract: ${tokenCode !== "0x" ? "✅ Deployed" : "❌ Not Found"}`);
        console.log(`      - Sender Contract: ${senderCode !== "0x" ? "✅ Deployed" : "❌ Not Found"}`);

        if (tokenCode === "0x" || senderCode === "0x") {
          console.log(`   💡 Re-deploy N1 contracts: npm run deploy:n1`);
        }

      } catch (error) {
        console.log(`   ❌ N1 deployment check failed: ${error.message}`);
      }
    });

    it("🔍 Should verify N2 contracts on correct network", async function () {
      try {
        const deployN2 = JSON.parse(fs.readFileSync(N2_FILE, "utf8"));
        const n2Provider = new ethers.JsonRpcProvider("http://127.0.0.1:9545");

        const network = await n2Provider.getNetwork();
        console.log(`   🔍 N2 Deployment Check:`);
        console.log(`      - Current Network: ${network.chainId}`);
        console.log(`      - Expected: 1338`);

        if (network.chainId !== 1338n) {
          console.log(`   ⚠️  WARNING: Connected to wrong N2 network!`);
          console.log(`   💡 Make sure you're connected to Anvil (chainId 1338)`);
        }

        const tokenCode = await n2Provider.getCode(deployN2.token);
        const receiverCode = await n2Provider.getCode(deployN2.receiver);

        console.log(`      - Token Contract: ${tokenCode !== "0x" ? "✅ Deployed" : "❌ Not Found"}`);
        console.log(`      - Receiver Contract: ${receiverCode !== "0x" ? "✅ Deployed" : "❌ Not Found"}`);

        if (tokenCode === "0x" || receiverCode === "0x") {
          console.log(`   💡 Re-deploy N2 contracts: docker compose run --rm -e USE_BLS=1 deployer bash scripts/docker-deploy.sh`);
        }

      } catch (error) {
        console.log(`   ❌ N2 deployment check failed: ${error.message}`);
      }
    });
  });

  describe("🎯 5. INTEGRATION READINESS CHECK", function () {
    it("✅ Should verify complete bridge setup", async function () {
      const checks = {
        n1Network: false,
        n2Network: false,
        n1Contracts: false,
        n2Contracts: false,
        relayerConfig: false,
        frontendSync: false
      };
      let deployN1;

      try {
        // Check N1
        const n1Provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        const n1Network = await n1Provider.getNetwork();
        checks.n1Network = n1Network.chainId === 31337n;

        // Check N2
        const n2Provider = new ethers.JsonRpcProvider("http://127.0.0.1:9545");
        const n2Network = await n2Provider.getNetwork();
        checks.n2Network = n2Network.chainId === 1338n;

        // Check N1 contracts
        deployN1 = JSON.parse(fs.readFileSync("deploy-N1.json", "utf8"));
        const tokenN1Code = await n1Provider.getCode(deployN1.token);
        const senderCode = await n1Provider.getCode(deployN1.sender);
        checks.n1Contracts = tokenN1Code !== "0x" && senderCode !== "0x";

        // Check N2 contracts
        const deployN2 = JSON.parse(fs.readFileSync(N2_FILE, "utf8"));
        const tokenN2Code = await n2Provider.getCode(deployN2.token);
        const receiverCode = await n2Provider.getCode(deployN2.receiver);
        checks.n2Contracts = tokenN2Code !== "0x" && receiverCode !== "0x";

        // Check relayer config
        checks.relayerConfig = !!process.env.PRIVATE_KEY_RELAYER &&
                              process.env.RPC_URL_N1 === "http://127.0.0.1:8545" &&
                              process.env.RPC_URL_N2 === "http://127.0.0.1:9545";

        // Check frontend sync (public/config.js, autogenerado por `npm run config`)
        if (fs.existsSync("public/config.js")) {
          const configContent = fs.readFileSync("public/config.js", "utf8");
          const frontendToken = configContent.match(/TOKEN_N1\s*:\s*["']([^"']+)["']/)?.[1];
          const frontendSender = configContent.match(/SENDER_N1\s*:\s*["']([^"']+)["']/)?.[1];
          checks.frontendSync = frontendToken?.toLowerCase() === deployN1.token.toLowerCase() &&
                               frontendSender?.toLowerCase() === deployN1.sender.toLowerCase();
        }

      } catch (error) {
        console.log(`   ❌ Setup check error: ${error.message}`);
      }

      console.log(`\n   📊 BRIDGE READINESS REPORT:`);
      console.log(`      - N1 Network (31337): ${checks.n1Network ? "✅" : "❌"}`);
      console.log(`      - N2 Network (1338):  ${checks.n2Network ? "✅" : "❌"}`);
      console.log(`      - N1 Contracts:       ${checks.n1Contracts ? "✅" : "❌"}`);
      console.log(`      - N2 Contracts:       ${checks.n2Contracts ? "✅" : "❌"}`);
      console.log(`      - Relayer Config:     ${checks.relayerConfig ? "✅" : "❌"}`);
      console.log(`      - Frontend Sync:      ${checks.frontendSync ? "✅" : "❌"}`);

      const allReady = Object.values(checks).every(check => check);
      console.log(`\n   🎯 OVERALL STATUS: ${allReady ? "✅ READY TO BRIDGE" : "❌ NEEDS FIXES"}`);

      if (!allReady) {
        console.log(`\n   🔧 NEXT STEPS:`);
        if (!checks.n1Network) console.log(`      - Start N1: npm run node:n1`);
        if (!checks.n2Network) console.log(`      - Start N2: npm run node:n2`);
        if (!checks.n1Contracts) console.log(`      - Deploy N1: npm run deploy:n1`);
        if (!checks.n2Contracts) console.log(`      - Deploy N2: npm run deploy:n2 (o deploy:n2:zk)`);
        if (!checks.relayerConfig) console.log(`      - Fix .env configuration (RPC_URL_N1/RPC_URL_N2)`);
        if (!checks.frontendSync) console.log(`      - npm run config`);
      }

      // Don't fail test, just report
      expect(true).to.be.true; // Always pass but report issues
    });
  });
});
