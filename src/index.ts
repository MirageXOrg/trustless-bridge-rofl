#!/usr/bin/env node

import { Command } from 'commander';
import { RoflUtility } from './RoflUtility';
import { TrustlessBridgeOracle } from './TrustlessBridgeOracle';
import { BitcoinConnection } from './BitcoinConnection';

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
    .parse(process.argv);
  
  const options = program.opts();
  
  console.log(`Starting Trustless Bridge ROFL Oracle service. Using contract ${options.contractAddress} on ${options.network} with Bitcoin ${options.bitcoinNetwork}.`);
  
  // const roflUtility = new RoflUtility(options.kms);
  // let secret = options.secret;
  
  // if (!secret) {
  //   secret = await roflUtility.fetchKey(options.keyId);
  // }
  
  // const oracle = new TrustlessBridgeOracle(
  //   options.contractAddress,
  //   options.bitcoinNetwork,
  //   roflUtility,
  //   secret
  // );
  
  // await oracle.run();

  const btcConn = new BitcoinConnection('testnet', '1wSjQB5nARU27CiumPiwHruuCAgxHzyRx');

  console.log(await btcConn.fetchTransactionInfo('46ebe264b0115a439732554b2b390b11b332b5b5692958b1754aa0ee57b64265'))
}

// Run the main function
main().catch(error => {
  console.error('Error running oracle:', error);
  process.exit(1);
}); 