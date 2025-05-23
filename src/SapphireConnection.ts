import { JsonRpcProvider, Contract, BaseContractMethod, Wallet } from 'ethers';
import { wrapEthersProvider, wrapEthersSigner } from '@oasisprotocol/sapphire-ethers-v6';

/**
 * Class for managing connections to the Oasis Sapphire network
 */
export class SapphireConnection {
  private rpcUrls: string[];
  private currentRpcIndex: number = 0;
  private provider: JsonRpcProvider | null = null;
  private wrappedProvider: any | null = null;
  private isReconnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY_MS = 1000;
  private wallet: Wallet | null = null;
  private wrappedWallet: any | null = null;
  private contract: Contract | null = null;

  /**
   * Constructor for SapphireConnection
   * @param rpcUrls - List of RPC URLs to try in order
   */
  constructor(rpcUrls: string[]) {
    this.rpcUrls = rpcUrls;
  }

  /**
   * Get the current provider
   * @returns The wrapped provider
   */
  getProvider(): any {
    if (!this.wrappedProvider) {
      throw new Error('Provider not initialized. Call connect() first.');
    }
    return this.wrappedProvider;
  }

  /**
   * Get the connected wallet
   * @returns The wallet instance
   */
  getWallet(): Wallet {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call connect() first.');
    }
    return this.wallet;
  }


  /**
   * Get the connected wallet
   * @returns The wallet instance
   */
  getWrappedWallet(): any {
    if (!this.wrappedWallet) {
      throw new Error('Wallet not initialized. Call connect() first.');
    }
    return this.wrappedWallet;
  }

  /**
   * Get the connected contract
   * @returns The contract instance
   */
  getContract(): Contract {
    if (!this.contract) {
      throw new Error('Contract not initialized. Call connect() first.');
    }
    return this.contract;
  }

  /**
   * Connect to the Sapphire network
   * @returns A promise that resolves when connected
   */
  async connect(): Promise<void> {
    console.log('[Sapphire] Initializing connection...');
    
    // Try each RPC URL until one works
    let connected = false;
    let lastError: Error | null = null;
    
    for (let i = 0; i < this.rpcUrls.length; i++) {
      const rpcIndex = (this.currentRpcIndex + i) % this.rpcUrls.length;
      const rpcUrl = this.rpcUrls[rpcIndex];
      
      try {
        console.log(`[Sapphire] Attempting connection to: ${rpcUrl}`);
        
        // Create a provider
        this.provider = new JsonRpcProvider(rpcUrl);
        
        // Test the connection
        await this.provider.getNetwork();
        
        // Wrap the provider with Sapphire privacy
        this.wrappedProvider = wrapEthersProvider(this.provider);
        
        // Update the current RPC index
        this.currentRpcIndex = rpcIndex;
        
        console.log(`[Sapphire] Connected successfully to: ${rpcUrl}`);
        connected = true;
        break;
      } catch (error) {
        console.error(`Failed to connect to ${rpcUrl}:`, error);
        lastError = error as Error;
      }
    }
    
    if (!connected) {
      throw new Error(`Failed to connect to any RPC URL. Last error: ${lastError?.message}`);
    }
  }

  /**
   * Initialize wallet with private key
   * @param privateKey - Private key for signing transactions
   */
  initializeWallet(privateKey: string): void {
    if (!this.wrappedProvider) {
      throw new Error('Provider not initialized. Call connect() first.');
    }
    
    // Create wallet and connect it to the provider
    this.wallet = new Wallet(privateKey).connect(this.provider);
    
    // Wrap the wallet with Sapphire privacy
    this.wrappedWallet = wrapEthersSigner(this.wallet);
    
    console.log('[Sapphire] Wallet initialized');
  }

  /**
   * Connect to a contract
   * @param contractAddress - Address of the contract to connect to
   * @param contractAbi - ABI of the contract
   */
  connectToContract(contractAddress: string, contractAbi: any): void {
    if (!this.wrappedWallet) {
      throw new Error('Wallet not initialized. Call initializeWallet() first.');
    }
    
    // Create contract with wrapped signer
    this.contract = new Contract(contractAddress, contractAbi, this.wrappedWallet);
    
    // Add error handling for network-related calls
    const originalSend = (this.contract as any).send;
    (this.contract as any).send = async (...args: any[]) => {
      try {
        return await originalSend.apply(this.contract, args);
      } catch (error: unknown) {
        const err = error as Error;
        // Check if it's an RPC error
        if (err.message && (
            err.message.includes('network') || 
            err.message.includes('timeout') || 
            err.message.includes('connection') ||
            err.message.includes('failed') ||
            err.message.includes('error')
          )) {
          await this.handleRpcError(err);
          // Retry the call after reconnection
          return await originalSend.apply(this.contract, args);
        }
        throw error;
      }
    };
    
    // Create a direct contract instance for view functions
    const directContract = new Contract(contractAddress, contractAbi, this.provider);
    
    // Override specific view functions to use the direct contract
    (this.contract as any).publicKey = async () => {
      return await (directContract as any).publicKey();
    };
    
    console.log(`[Sapphire] Contract connection established at: ${contractAddress}`);
  }

  /**
   * Reconnect to the Sapphire network
   * @returns A promise that resolves when reconnected
   */
  async reconnect(): Promise<void> {
    console.log('[Sapphire] Reconnection attempt initiated');
    
    // Try the next RPC URL
    this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcUrls.length;
    
    // Connect to the new RPC URL
    await this.connect();
  }

  /**
   * Handle RPC errors and attempt to reconnect if necessary
   * @param error - The error that occurred
   * @returns A promise that resolves when reconnected or when max attempts are reached
   */
  private async handleRpcError(error: Error): Promise<void> {
    console.error(`RPC error occurred: ${error.message}`);
    
    // If already reconnecting, don't start another reconnection attempt
    if (this.isReconnecting) {
      console.log('[Sapphire] Reconnection already in progress, skipping');
      return;
    }
    
    this.isReconnecting = true;
    
    try {
      // Try to reconnect
      await this.reconnect();
      console.log('[Sapphire] Reconnection successful');
      this.reconnectAttempts = 0;
    } catch (reconnectError) {
      console.error('Failed to reconnect:', reconnectError);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
        console.error(`Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached`);
        throw new Error(`Failed to reconnect after ${this.MAX_RECONNECT_ATTEMPTS} attempts`);
      }
      
      // Wait before trying again
      console.log(`[Sapphire] Waiting ${this.RECONNECT_DELAY_MS}ms before next attempt`);
      await new Promise(resolve => setTimeout(resolve, this.RECONNECT_DELAY_MS));
      
      // Try again
      await this.handleRpcError(error);
    } finally {
      this.isReconnecting = false;
    }
  }
} 