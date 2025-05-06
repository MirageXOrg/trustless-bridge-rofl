import { BitcoinRpcNode } from "./bitcoin/BitcoinNetwork";


/**
 * Default RPC configurations
 */
export const DEFAULT_RPC_CONFIGS = {
  sapphire: {
    mainnet: [
      'https://sapphire.oasis.io',
      'https://sapphire-rpc.oasis.io'
    ],
    testnet: [
      'https://testnet.sapphire.oasis.io',
      'https://testnet.sapphire-rpc.oasis.io'
    ],
    localnet: [
      'http://localhost:8545'
    ]
  },
  bitcoin: {
    mainnet: [
      {
        url: 'https://bitcoin-mainnet-rpc.publicnode.com',
        username: '',
        password: '',
        name: 'public-node',
        ssl: true
      }
    ],
    testnet: [
      {
        url: 'https://bitcoin-testnet-rpc.publicnode.com',
        username: '',
        password: '',
        name: 'public-node',
        ssl: true
      }
    ]
  }
};

/**
 * Get Sapphire RPC URLs from environment variables or use defaults
 * @param network - Network name (mainnet, testnet, localnet)
 * @returns Array of RPC URLs
 */
export function getSapphireRpcUrls(network: string): string[] {
  // Try to get RPC URLs from environment variable
  const envRpcUrls = process.env.SAPPHIRE_RPC_URLS;
  if (envRpcUrls) {
    return envRpcUrls.split(',').map(url => url.trim());
  }

  // Use default RPC URLs based on network
  return DEFAULT_RPC_CONFIGS.sapphire[network as keyof typeof DEFAULT_RPC_CONFIGS.sapphire] || 
         DEFAULT_RPC_CONFIGS.sapphire.localnet;
}

/**
 * Get Bitcoin RPC nodes from environment variables or use defaults
 * @param network - Network name (mainnet, testnet)
 * @returns Array of Bitcoin RPC nodes
 */
export function getBitcoinRpcNodes(network: string): BitcoinRpcNode[] {
  // Try to get RPC nodes from environment variable
  const envRpcNodes = process.env.BITCOIN_RPC_NODES;
  if (envRpcNodes) {
    try {
      return JSON.parse(envRpcNodes);
    } catch (error) {
      console.error('Failed to parse BITCOIN_RPC_NODES environment variable:', error);
    }
  }

  // Use default RPC nodes based on network
  return DEFAULT_RPC_CONFIGS.bitcoin[network as keyof typeof DEFAULT_RPC_CONFIGS.bitcoin] || 
         DEFAULT_RPC_CONFIGS.bitcoin.testnet;
}

/**
 * Interface for Bitcoin API configuration
 */
export interface BitcoinApiConfig {
  url: string;
  name: string;
  priority: number; // Lower number means higher priority
  timeout?: number;
  retries?: number;
}

/**
 * Get Bitcoin API configurations based on network, environment variables, or CLI arguments
 * @param network - Bitcoin network (mainnet/testnet)
 * @returns Array of Bitcoin API configurations
 */
export function getBitcoinApiConfigs(network: string): BitcoinApiConfig[] {
  // Try to get API configs from environment variable
  const envApiConfigs = process.env.BITCOIN_API_CONFIGS;
  if (envApiConfigs) {
    try {
      return JSON.parse(envApiConfigs);
    } catch (error) {
      console.error('Failed to parse BITCOIN_API_CONFIGS environment variable:', error);
    }
  }

  // Default configurations
  const defaultConfigs: BitcoinApiConfig[] = [
    {
      url: 'https://mempool.space/api',
      name: 'Mempool.space',
      priority: 1,
      timeout: 5000,
      retries: 2
    },
    {
      url: 'https://blockstream.info/api',
      name: 'Blockstream',
      priority: 2,
      timeout: 5000,
      retries: 2
    }
  ];

  if (network === 'testnet') {
    return defaultConfigs.map(config => ({
      ...config,
      url: config.url.replace('/api', '/testnet/api')
    }));
  }

  return defaultConfigs;
} 

export const TRUSTLESS_BTC_ABI =  [
    {
      "inputs": [
        {
          "internalType": "bytes21",
          "name": "inRoflAppID",
          "type": "bytes21"
        },
        {
          "internalType": "address",
          "name": "inOracle",
          "type": "address"
        },
        {
          "internalType": "string",
          "name": "domain",
          "type": "string"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "inputs": [],
      "name": "A13e_RevokedAuthToken",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "BurnTransactionNotGenerated",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "BurnTransactionNotSigned",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidBitcoinAddress",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidPrivateKey",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidSignature",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "KeyGenerationFailed",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "KeysAlreadyGenerated",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "RoflOriginNotAuthorizedForApp",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "SiweAuth_AddressMismatch",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "SiweAuth_ChainIdMismatch",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "SiweAuth_DomainMismatch",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "SiweAuth_Expired",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "SiweAuth_NotBeforeInFuture",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "SiweParser_InvalidAddressLength",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "SiweParser_InvalidNonce",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "SubcallError",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "TransactionAlreadyProcessed",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "UnauthorizedOracle",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "WrongBurnId",
      "type": "error"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "owner",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "spender",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "Approval",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "burnId",
          "type": "uint256"
        }
      ],
      "name": "BurnGenerateTransaction",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "burnId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "bytes",
          "name": "rawTx",
          "type": "bytes"
        }
      ],
      "name": "BurnSigned",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "burnId",
          "type": "uint256"
        }
      ],
      "name": "BurnValidateTransaction",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "burnId",
          "type": "uint256"
        }
      ],
      "name": "BurnValidated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "bytes32",
          "name": "privateKey",
          "type": "bytes32"
        },
        {
          "indexed": false,
          "internalType": "bytes",
          "name": "publicKey",
          "type": "bytes"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "bitcoinAddress",
          "type": "string"
        }
      ],
      "name": "KeysGenerated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "txHash",
          "type": "bytes32"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "signature",
          "type": "string"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "ethereumAddress",
          "type": "address"
        }
      ],
      "name": "TransactionProofSubmitted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "to",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "Transfer",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "owner",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "spender",
          "type": "address"
        }
      ],
      "name": "allowance",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "spender",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "approve",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "balanceOf",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "bitcoinAddress",
      "outputs": [
        {
          "internalType": "string",
          "name": "",
          "type": "string"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        },
        {
          "internalType": "string",
          "name": "toBitcoinAddress",
          "type": "string"
        }
      ],
      "name": "burn",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "burnCounter",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "burnData",
      "outputs": [
        {
          "internalType": "address",
          "name": "user",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "timestamp",
          "type": "uint256"
        },
        {
          "internalType": "string",
          "name": "bitcoinAddress",
          "type": "string"
        },
        {
          "internalType": "uint8",
          "name": "status",
          "type": "uint8"
        },
        {
          "internalType": "bytes32",
          "name": "transactionHash",
          "type": "bytes32"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "decimals",
      "outputs": [
        {
          "internalType": "uint8",
          "name": "",
          "type": "uint8"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "spender",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "subtractedValue",
          "type": "uint256"
        }
      ],
      "name": "decreaseAllowance",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "domain",
      "outputs": [
        {
          "internalType": "string",
          "name": "",
          "type": "string"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "generateKeys",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "spender",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "addedValue",
          "type": "uint256"
        }
      ],
      "name": "increaseAllowance",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "keysGenerated",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "lastVerifiedBurn",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "siweMsg",
          "type": "string"
        },
        {
          "components": [
            {
              "internalType": "bytes32",
              "name": "r",
              "type": "bytes32"
            },
            {
              "internalType": "bytes32",
              "name": "s",
              "type": "bytes32"
            },
            {
              "internalType": "uint256",
              "name": "v",
              "type": "uint256"
            }
          ],
          "internalType": "struct SignatureRSV",
          "name": "sig",
          "type": "tuple"
        }
      ],
      "name": "login",
      "outputs": [
        {
          "internalType": "bytes",
          "name": "",
          "type": "bytes"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        },
        {
          "internalType": "bytes32",
          "name": "txHash",
          "type": "bytes32"
        }
      ],
      "name": "mint",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "name",
      "outputs": [
        {
          "internalType": "string",
          "name": "",
          "type": "string"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "oracle",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "",
          "type": "bytes32"
        }
      ],
      "name": "processedMintTransactions",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "publicKey",
      "outputs": [
        {
          "internalType": "bytes",
          "name": "",
          "type": "bytes"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "requestCreateBurnBitcoinTransaction",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "requestValidateBurnBitcoinTransaction",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "roflAppID",
      "outputs": [
        {
          "internalType": "bytes21",
          "name": "",
          "type": "bytes21"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "addr",
          "type": "address"
        }
      ],
      "name": "setOracle",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "msgHash",
          "type": "bytes32"
        },
        {
          "internalType": "bytes",
          "name": "token",
          "type": "bytes"
        }
      ],
      "name": "sign",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "nonce",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "r",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "s",
          "type": "uint256"
        },
        {
          "internalType": "uint8",
          "name": "v",
          "type": "uint8"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "burnId",
          "type": "uint256"
        },
        {
          "internalType": "bytes",
          "name": "rawTx",
          "type": "bytes"
        },
        {
          "internalType": "bytes32",
          "name": "transactionHash",
          "type": "bytes32"
        }
      ],
      "name": "signBurn",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "txHash",
          "type": "bytes32"
        },
        {
          "internalType": "string",
          "name": "signature",
          "type": "string"
        },
        {
          "internalType": "address",
          "name": "ethereumAddress",
          "type": "address"
        }
      ],
      "name": "submitMintTransactionProof",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "symbol",
      "outputs": [
        {
          "internalType": "string",
          "name": "",
          "type": "string"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "totalSupply",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "to",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "transfer",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "from",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "to",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "transferFrom",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "burnId",
          "type": "uint256"
        }
      ],
      "name": "validateBurn",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ];
  