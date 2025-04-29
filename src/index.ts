#!/usr/bin/env node

import { Command } from 'commander';
import { RoflUtility } from './RoflUtility';
import { TrustlessBridgeOracle } from './TrustlessBridgeOracle';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Main function for the Trustless Bridge ROFL Oracle CLI tool.
 */
async function main() {
  const program = new Command();
  
  program
    .name('trustless-bridge-oracle')
    .description('A TypeScript CLI tool for the Trustless Bridge ROFL Oracle')
    .version('1.0.0');
  
  program
    .requiredOption('-c, --contract-address <address>', 'Address of the smart contract to interact with')
    .option('-n, --network <network>', 'Chain name to connect to (sapphire, sapphire-testnet, sapphire-localnet)', 'sapphire-localnet')
    .option('-b, --bitcoin-network <network>', 'Bitcoin network to connect to (mainnet, testnet)', 'testnet')
    .option('-k, --kms <url>', 'Override ROFL\'s appd service URL', '')
    .option('-i, --key-id <id>', 'Override the oracle\'s secret key ID on KMS', 'trustless-bridge-oracle')
    .option('-s, --secret <secret>', 'Secret key of the oracle account (only for testing)')
    .option('--sapphire-rpc <urls>', 'Comma-separated list of Sapphire RPC URLs')
    .option('--bitcoin-rpc <nodes>', 'JSON string of Bitcoin RPC nodes configuration')
    .option('--bitcoin-api-configs <configs>', 'JSON string of Bitcoin API configurations. Example: \'[{"url":"https://api.example.com","name":"Example API","priority":1}]\'')
    .parse(process.argv);
  
  const options = program.opts();

  if (!options.bitcoinNetwork) {
    process.env.BITCOIN_NETWORK = options.bitcoinNetwork;
  }

  if (options.network) {
    process.env.NETWORK = options.network;
  }
  // Set environment variables from CLI options if provided
  if (options.sapphireRpc) {
    process.env.SAPPHIRE_RPC_URLS = options.sapphireRpc;
  }
  if (options.bitcoinRpc) {
    process.env.BITCOIN_RPC_NODES = options.bitcoinRpc;
  }
  if (options.bitcoinApiConfigs) {
    process.env.BITCOIN_API_CONFIGS = options.bitcoinApiConfigs;
  }
  
  console.log(`[TrustlessBridgeOracle] Starting service. Contract: ${options.contractAddress}, Network: ${options.network}, Bitcoin: ${options.bitcoinNetwork}`);
  
  const roflUtility = new RoflUtility(options.kms);
  let secret = options.secret;
  
  if (process.env.ORACLE_SECRET) { // override for testing
    secret = process.env.ORACLE_SECRET;
  } else if (!secret) {
    secret = await roflUtility.fetchKey(options.keyId);
  }
  
  const oracle = new TrustlessBridgeOracle(
    options.contractAddress,
    options.bitcoinNetwork,
    roflUtility,
    secret
  );
  
  await oracle.run();
}

// Run the main function
main().catch(error => {
  console.error('Error running oracle:', error);
  process.exit(1);
}); 