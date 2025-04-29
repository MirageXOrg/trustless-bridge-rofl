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