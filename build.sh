#!/bin/bash

# Default values
CONTRACT_ADDRESS="0x1234567890123456789012345678901234567890"
NETWORK="sapphire-localnet"
BITCOIN_NETWORK="testnet"
KMS=""
KEY_ID="trustless-bridge-oracle"
SECRET=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --contract-address)
      CONTRACT_ADDRESS="$2"
      shift 2
      ;;
    --network)
      NETWORK="$2"
      shift 2
      ;;
    --bitcoin-network)
      BITCOIN_NETWORK="$2"
      shift 2
      ;;
    --kms)
      KMS="$2"
      shift 2
      ;;
    --key-id)
      KEY_ID="$2"
      shift 2
      ;;
    --secret)
      SECRET="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Stop and remove existing container if it exists
docker stop trustless-bridge-oracle || true
docker rm trustless-bridge-oracle || true

# Build the Docker image
docker build -t trustless-bridge-oracle .

# Run the container with the provided arguments
docker run -d --name trustless-bridge-oracle trustless-bridge-oracle \
  --contract-address "$CONTRACT_ADDRESS" \
  --network "$NETWORK" \
  --bitcoin-network "$BITCOIN_NETWORK" \
  ${KMS:+--kms "$KMS"} \
  --key-id "$KEY_ID" \
  ${SECRET:+--secret "$SECRET"}

# Show logs
echo "Container started. Showing logs:"
docker logs -f trustless-bridge-oracle 