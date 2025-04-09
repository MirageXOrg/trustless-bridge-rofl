# Trustless Bridge ROFL

A TypeScript application dockerized for Oasis ROFL.

## Prerequisites

- Docker
- Docker Compose
- Node.js (for local development)

## Getting Started

### Local Development

1. Install dependencies:
   ```
   npm install
   ```

2. Run the application:
   ```
   npm start -- --contract-address 0x1234567890123456789012345678901234567890 --network sapphire-localnet --bitcoin-network testnet
   ```

### Docker

1. Build and run the Docker container:
   ```
   ./build.sh --contract-address 0x1234567890123456789012345678901234567890 --network sapphire-localnet --bitcoin-network testnet
   ```

   Or use Docker Compose:
   ```
   docker-compose up -d
   ```

2. View logs:
   ```
   docker logs trustless-bridge-oracle
   ```

3. Stop the container:
   ```
   docker stop trustless-bridge-oracle
   ```

## Command Line Arguments

The application accepts the following command line arguments:

- `--contract-address <address>` (required): Address of the smart contract to interact with
- `--network <network>` (optional): Chain name to connect to (sapphire, sapphire-testnet, sapphire-localnet), default: sapphire-localnet
- `--bitcoin-network <network>` (optional): Bitcoin network to connect to (mainnet, testnet), default: testnet
- `--kms <url>` (optional): Override ROFL's appd service URL
- `--key-id <id>` (optional): Override the oracle's secret key ID on KMS, default: trustless-bridge-oracle
- `--secret <secret>` (optional): Secret key of the oracle account (only for testing)

## RoflUtility Implementation

The `RoflUtility` class provides functionality for interacting with ROFL services:

- `fetchKey(keyId: string)`: Fetches a key from the KMS service
- `submitTx(tx: TxParams)`: Submits a transaction to the blockchain

The implementation is based on the Python version from the [demo-rofl-chatbot](https://github.com/oasisprotocol/demo-rofl-chatbot) repository.

## Project Structure

- `src/` - TypeScript source code
  - `index.ts` - Main entry point
  - `RoflUtility.ts` - Utility for ROFL services
  - `TrustlessBridgeOracle.ts` - Oracle implementation
  - `types.ts` - TypeScript type definitions
- `dist/` - Compiled JavaScript code
- `Dockerfile` - Docker configuration
- `docker-compose.yml` - Docker Compose configuration
- `build.sh` - Script to build and run the Docker container