const { createWalletClient, http, parseEther, getContract, deployContract } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { bytecode: EACAggregatorProxyBytecode, abi: EACAggregatorProxyAbi } = require('./artifacts/contracts/EACAggregatorProxy.sol/EACAggregatorProxy.json');
const { bytecode: VEZProxyBytecode, abi: VEZProxyAbi } = require('./artifacts/contracts/vezcurproxy.sol/VEZproxy.json');

// Load environment variables
require('dotenv').config();
const privateKey = process.env.CRE_CUSTODIAN_PRIVATE_KEY;
if (!privateKey) {
  console.error('CRE_CUSTODIAN_PRIVATE_KEY not found in .env');
  process.exit(1);
}

// Create wallet client
const account = privateKeyToAccount(privateKey);
const client = createWalletClient({
  account,
  transport: http('http://localhost:8081')
});

async function main() {
  console.log('Deploying EACAggregatorProxy...');
  const aggregator = await deployContract(client, {
    abi: EACAggregatorProxyAbi,
    bytecode: EACAggregatorProxyBytecode,
    args: []
  });
  console.log(`EACAggregatorProxy deployed to: ${aggregator.address}`);

  console.log('Deploying VEZproxy...');
  const vezProxy = await deployContract(client, {
    abi: VEZProxyAbi,
    bytecode: VEZProxyBytecode,
    args: [aggregator.address] // constructor argument: _reserveProof
  });
  console.log(`VEZproxy deployed to: ${vezProxy.address}`);

  console.log('\nDeployment complete:');
  console.log(`  Aggregator: ${aggregator.address}`);
  console.log(`  VEZ Proxy:  ${vezProxy.address}`);

  // Update .env
  const fs = require('fs');
  const envPath = './.env';
  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(/VEZ_PROXY_ADDRESS=.*/, `VEZ_PROXY_ADDRESS=${vezProxy.address}`);
  envContent = envContent.replace(/RESERVE_PROOF_ADDRESS=.*/, `RESERVE_PROOF_ADDRESS=${aggregator.address}`);
  envContent = envContent.replace(/AGGREGATOR_ADDRESS=.*/, `AGGREGATOR_ADDRESS=${aggregator.address}`);
  fs.writeFileSync(envPath, envContent);
  console.log('\nUpdated .env with contract addresses');

  // Update config files
  const updateConfig = (path) => {
    let config = JSON.parse(fs.readFileSync(path, 'utf8'));
    config.vezProxyAddress = vezProxy.address;
    config.aggregatorAddress = aggregator.address;
    config.initialRecipient = vezProxy.address; // Assuming initial recipient is the proxy itself? Or custodian? We'll use proxy for now.
    config.custodianAddress = account.address;
    fs.writeFileSync(path, JSON.stringify(config, null, 2));
    console.log(`Updated ${path}`);
  };

  updateConfig('./config.staging.json');
  updateConfig('./config.production.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});