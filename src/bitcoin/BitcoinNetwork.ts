import Client = require('bitcoin-core');
import * as bitcoin from 'bitcoinjs-lib';
import { getBitcoinRpcNodes, getBitcoinApiConfigs, BitcoinApiConfig } from '../config';

/**
 * Interface for Bitcoin RPC node configuration
 */
export interface BitcoinRpcNode {
  url: string;
  username: string;
  password: string;
  name: string; // Optional name for the node (e.g., "My Node", "BlockCypher", etc.)
  timeout?: number; // Optional timeout in milliseconds
  ssl?: boolean; // Whether to use SSL for the connection
  wallet?: string; // Optional wallet name for Bitcoin Core RPC
}

/**
 * Class for managing Bitcoin network connections
 */
export class BitcoinNetwork {
  private _bitcoinNetwork: string;
  private rpcNodes: BitcoinRpcNode[];
  private _network: bitcoin.networks.Network;
  private clients: Map<string, Client> = new Map();
  private apiConfigs: BitcoinApiConfig[];

  /**
   * Constructor for BitcoinNetwork
   * @param bitcoinNetwork - Bitcoin network to connect to (mainnet, testnet)
   * @param rpcNodes - Optional list of Bitcoin RPC nodes to connect to
   * @param apiConfigs - Optional list of Bitcoin API configurations
   * 
   * Note: Bitcoin API configurations can be set in multiple ways (in order of precedence):
   * 1. Directly via the apiConfigs parameter
   * 2. Via CLI argument: --bitcoin-api-configs='[{"url":"...","name":"...","priority":1}]'
   * 3. Via environment variable: BITCOIN_API_CONFIGS='[{"url":"...","name":"...","priority":1}]'
   * 4. Default configurations from config.ts
   */
  constructor(
    bitcoinNetwork: string,
    rpcNodes?: BitcoinRpcNode[],
    apiConfigs?: BitcoinApiConfig[]
  ) {
    this._bitcoinNetwork = bitcoinNetwork;
    
    // Set Bitcoin network
    this._network = this._bitcoinNetwork === 'testnet' 
      ? bitcoin.networks.testnet 
      : bitcoin.networks.bitcoin;
    
    // Set RPC nodes from parameter or environment/default
    this.rpcNodes = rpcNodes || getBitcoinRpcNodes(this._bitcoinNetwork);
    
    // Set API configurations from parameter or environment/default
    this.apiConfigs = apiConfigs || getBitcoinApiConfigs(this._bitcoinNetwork);
    
    // Validate API configurations
    this.validateApiConfigs();
    
    // Sort API configurations by priority
    this.apiConfigs.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Validate API configurations
   * @throws Error if any configuration is invalid
   */
  private validateApiConfigs(): void {
    if (!Array.isArray(this.apiConfigs)) {
      throw new Error('API configurations must be an array');
    }

    for (const config of this.apiConfigs) {
      if (!config.url || !config.name || typeof config.priority !== 'number') {
        throw new Error('Invalid API configuration: url, name, and priority are required');
      }
    }
  }

  /**
   * Get the Bitcoin network type (mainnet/testnet)
   */
  get bitcoinNetwork(): string {
    return this._bitcoinNetwork;
  }

  /**
   * Get the Bitcoin network configuration
   */
  get network(): bitcoin.networks.Network {
    return this._network;
  }

  /**
   * Initialize connections to all RPC nodes
   */
  async initializeConnections(): Promise<void> {
    console.log('[Bitcoin] Initializing RPC connections');
    
    for (const node of this.rpcNodes) {
      try {
        // Create client configuration
        const clientConfig: any = {
          host: node.url,
          username: node.username,
          password: node.password,
          timeout: node.timeout || 30000,
        };
        
        // Add wallet path if specified
        if (node.wallet) {
          clientConfig.wallet = node.wallet;
        }
        
        // Add ssl property if needed
        if (node.ssl || node.url.startsWith('https')) {
          (clientConfig as any).ssl = true;
        }
        
        // Initialize Bitcoin Core client for this node
        const client = new Client(clientConfig);
        
        // Test the connection
        await (client as any).getBlockchainInfo();
        
        // Store the client
        this.clients.set(node.name || node.url, client);
        
        console.log(`[Bitcoin] Connected to node: ${node.name || node.url}`);
      } catch (error) {
        console.error(`Failed to connect to ${node.name || node.url}:`, error);
      }
    }
    
    if (this.clients.size === 0) {
      throw new Error('Failed to connect to any Bitcoin RPC nodes');
    }
  }

  /**
   * Get the first available Bitcoin client
   */
  getClient(): Client {
    if (this.clients.size === 0) {
      throw new Error('No Bitcoin clients available. Call initializeConnections() first.');
    }
    return Array.from(this.clients.values())[0];
  }

  /**
   * Get all available Bitcoin clients
   */
  getClients(): Map<string, Client> {
    return this.clients;
  }

  /**
   * Get the current network fee rate from the Bitcoin node
   * @returns Fee rate in satoshis per byte
   */
  async getNetworkFeeRate(): Promise<number> {
    if (this.clients.size === 0) {
      await this.initializeConnections();
    }

    const client = this.getClient();
    try {
      // Use command method to make raw RPC call to estimatesmartfee
      const feeInfo = await (client as any).command('estimatesmartfee', 1);
      if (feeInfo.feerate) {
        // Convert BTC/kB to satoshis/byte
        const feeRate = Math.ceil(feeInfo.feerate * 100000000 / 1000);
        
        // For testnet, cap the fee rate at 5 satoshis/byte
        if (this._bitcoinNetwork === 'testnet') {
          return Math.min(feeRate, 5)
        }
        
        return feeRate;
      }
    } catch (error) {
      console.error('Error getting network fee rate:', error);
    }
    
    // Fallback to a conservative fee rate if we can't get it from the node
    return this._bitcoinNetwork === 'testnet' ? 2 : 5; // 2 satoshis per byte for testnet, 5 for mainnet
  }

  /**
   * Get Bitcoin API configurations
   */
  get bitcoinApiConfigs(): BitcoinApiConfig[] {
    return this.apiConfigs;
  }
} 