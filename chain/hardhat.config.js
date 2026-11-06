require("@nomicfoundation/hardhat-toolbox");
const path = require("node:path");
// Load chain/.env automatically (no `source .env` needed, works on Windows). Shell variables win.
try { process.loadEnvFile(path.join(__dirname, ".env")); } catch { /* no .env yet */ }
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

// Use the solc-js bundled in node_modules instead of downloading a compiler (works offline / behind a proxy).
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === "0.8.28") {
    const compilerPath = require.resolve("solc/soljson.js");
    return { compilerPath, isSolcJs: true, version: args.solcVersion, longVersion: "0.8.28+commit.7893614a" };
  }
  return runSuper();
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 500 }, evmVersion: "cancun" } },
  networks: {
    hardhat: { hardfork: "cancun" },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
    base: {
      url: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
  },
  etherscan: {
    apiKey: { base: process.env.BASESCAN_KEY ?? "", baseSepolia: process.env.BASESCAN_KEY ?? "" },
    customChains: [
      { network: "baseSepolia", chainId: 84532, urls: { apiURL: "https://api-sepolia.basescan.org/api", browserURL: "https://sepolia.basescan.org" } },
      { network: "base", chainId: 8453, urls: { apiURL: "https://api.basescan.org/api", browserURL: "https://basescan.org" } },
    ],
  },
  sourcify: { enabled: false },
};
