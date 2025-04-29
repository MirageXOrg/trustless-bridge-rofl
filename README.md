# Trustless Bridge ROFL

A TypeScript application dockerized for Oasis ROFL.

TODO: Add description and diagrams

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

2. Create a `.env` file in the project root with your configuration:
   ```
   CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
   NETWORK=sapphire-localnet
   BITCOIN_NETWORK=testnet
   SAPPHIRE_RPC_URLS=https://sapphire1.example.com,https://sapphire2.example.com
   BITCOIN_RPC_NODES=[{"url":"https://bitcoin1.example.com","username":"user","password":"pass","name":"node1"}]
   BITCOIN_API_CONFIGS=[{"url":"https://mempool.space/api","name":"Mempool.space","priority":1,"timeout":5000,"retries":2}]
   ORACLE_SECRET=your_secret_here
   ```

3. Run the application:
   ```
   npm start
   ```

   Or with specific command line arguments to override .env values:
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

## Configuration

The application can be configured through multiple methods, listed in order of priority:

1. Command Line Arguments (highest priority)
2. Environment Variables (set in shell or .env file)
3. Default Configuration (lowest priority)

### Command Line Arguments

The application accepts the following command line arguments:

- `--contract-address <address>` (required): Address of the smart contract to interact with
- `--network <network>` (optional): Chain name to connect to (sapphire, sapphire-testnet, sapphire-localnet), default: sapphire-localnet
- `--bitcoin-network <network>` (optional): Bitcoin network to connect to (mainnet, testnet), default: testnet
- `--kms <url>` (optional): Override ROFL's appd service URL
- `--key-id <id>` (optional): Override the oracle's secret key ID on KMS, default: trustless-bridge-oracle
- `--secret <secret>` (optional): Secret key of the oracle account (only for testing)
- `--sapphire-rpc <urls>` (optional): Comma-separated list of Sapphire RPC URLs
- `--bitcoin-rpc <nodes>` (optional): JSON string of Bitcoin RPC nodes configuration

### Environment Variables

You can configure the application using environment variables, either by setting them in your shell or in a `.env` file:

```bash
# Shell environment variables
export CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
export NETWORK=sapphire-localnet
export BITCOIN_NETWORK=testnet
export SAPPHIRE_RPC_URLS="https://sapphire1.example.com,https://sapphire2.example.com"
export BITCOIN_RPC_NODES='[{"url":"https://bitcoin1.example.com","username":"user","password":"pass","name":"node1"}]'
export BITCOIN_API_CONFIGS='[{"url":"https://mempool.space/api","name":"Mempool.space","priority":1,"timeout":5000,"retries":2}]'
export ORACLE_SECRET=your_secret_here

# Or in .env file
CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
NETWORK=sapphire-localnet
BITCOIN_NETWORK=testnet
SAPPHIRE_RPC_URLS=https://sapphire1.example.com,https://sapphire2.example.com
BITCOIN_RPC_NODES=[{"url":"https://bitcoin1.example.com","username":"user","password":"pass","name":"node1"}]
BITCOIN_API_CONFIGS=[{"url":"https://mempool.space/api","name":"Mempool.space","priority":1,"timeout":5000,"retries":2}]
ORACLE_SECRET=your_secret_here
```

### Bitcoin API Configuration

The application can use multiple Bitcoin API providers as fallback. The configuration can be set through environment variables:

```bash
export BITCOIN_API_CONFIGS='[
  {
    "url": "https://mempool.space/api",
    "name": "Mempool.space",
    "priority": 1,
    "timeout": 5000,
    "retries": 2
  },
  {
    "url": "https://blockstream.info/api",
    "name": "Blockstream",
    "priority": 2,
    "timeout": 5000,
    "retries": 2
  }
]'
```

For testnet, the URLs will automatically be adjusted to use the testnet endpoints.

### Default Configuration

If no configuration is provided, the application will use default endpoints:

- Sapphire:
  - Mainnet: `https://sapphire.oasis.io`, `https://sapphire-rpc.oasis.io`
  - Testnet: `https://testnet.sapphire.oasis.io`, `https://testnet.sapphire-rpc.oasis.io`
  - Localnet: `http://localhost:8545`

- Bitcoin RPC:
  - Mainnet: `https://bitcoin-mainnet-rpc.publicnode.com` (public node)
  - Testnet: `https://bitcoin-testnet-rpc.publicnode.com` (public node)

- Bitcoin API (fallback):
  - Mainnet: Mempool.space, Blockstream
  - Testnet: Mempool.space Testnet, Blockstream Testnet

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
  - `config.ts` - RPC configuration and defaults
  - `bitcoin/` - Bitcoin-specific implementations
  - `abi/` - Smart contract ABIs
- `dist/` - Compiled JavaScript code
- `Dockerfile` - Docker configuration
- `docker-compose.yml` - Docker Compose configuration
- `build.sh` - Script to build and run the Docker container