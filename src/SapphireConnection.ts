import { JsonRpcProvider, Contract, BaseContractMethod, Wallet } from 'ethers';
import { wrapEthersProvider } from '@oasisprotocol/sapphire-ethers-v6';

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
    console.log('Connecting to Oasis Sapphire...');
    
    // Try each RPC URL until one works
    let connected = false;
    let lastError: Error | null = null;
    
    for (let i = 0; i < this.rpcUrls.length; i++) {
      const rpcIndex = (this.currentRpcIndex + i) % this.rpcUrls.length;
      const rpcUrl = this.rpcUrls[rpcIndex];
      
      try {
        console.log(`Trying RPC URL: ${rpcUrl}`);
        
        // Create a provider
        this.provider = new JsonRpcProvider(rpcUrl);
        
        // Test the connection
        await this.provider.getNetwork();
        
        // Wrap the provider with Sapphire privacy
        this.wrappedProvider = wrapEthersProvider(this.provider);
        
        // Update the current RPC index
        this.currentRpcIndex = rpcIndex;
        
        console.log(`Successfully connected to ${rpcUrl}`);
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
    
    this.wallet = new Wallet(privateKey, this.wrappedProvider);
    console.log('Wallet initialized with private key');
  }

  /**
   * Connect to a contract
   * @param contractAddress - Address of the contract to connect to
   * @param contractAbi - ABI of the contract
   */
  connectToContract(contractAddress: string, contractAbi: any): void {
    if (!this.wrappedProvider) {
      throw new Error('Provider not initialized. Call connect() first.');
    }
    
    this.contract = this.getContractWithErrorHandling(contractAddress, contractAbi);
    console.log(`Connected to contract at ${contractAddress}`);
  }

  /**
   * Reconnect to the Sapphire network
   * @returns A promise that resolves when reconnected
   */
  async reconnect(): Promise<void> {
    console.log('Reconnecting to Oasis Sapphire...');
    
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
      console.log('Already attempting to reconnect, skipping...');
      return;
    }
    
    this.isReconnecting = true;
    
    try {
      // Try to reconnect
      await this.reconnect();
      console.log('Successfully reconnected to a new RPC URL');
      this.reconnectAttempts = 0;
    } catch (reconnectError) {
      console.error('Failed to reconnect:', reconnectError);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
        console.error(`Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached`);
        throw new Error(`Failed to reconnect after ${this.MAX_RECONNECT_ATTEMPTS} attempts`);
      }
      
      // Wait before trying again
      console.log(`Waiting ${this.RECONNECT_DELAY_MS}ms before trying again...`);
      await new Promise(resolve => setTimeout(resolve, this.RECONNECT_DELAY_MS));
      
      // Try again
      await this.handleRpcError(error);
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Get the contract instance with automatic reconnection on failure
   * @param address - Contract address
   * @param abi - Contract ABI
   * @returns The contract instance
   */
  private getContractWithErrorHandling(address: string, abi: any): Contract {
    if (!this.wrappedProvider) {
      throw new Error('Provider not initialized. Call connect() first.');
    }
    
    const contract = new Contract(address, abi, this.wrappedProvider);
    
    // Add error handling to the contract
    const originalCall = contract.call as unknown as BaseContractMethod<any[], any, any>;
    
    // Override the call method to add error handling
    (contract as any).call = async (...args: any[]) => {
      try {
        return await originalCall.apply(contract, args);
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
          return await originalCall.apply(contract, args);
        }
        throw error;
      }
    };
    
    return contract;
  }
} 