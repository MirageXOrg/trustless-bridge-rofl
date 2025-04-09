import { RoflUtility } from './RoflUtility';
import { SapphireConnection } from './SapphireConnection';
import { BitcoinConnection, BitcoinTransactionInfo } from './BitcoinConnection';
import * as fs from 'fs';
import * as path from 'path';
import { Contract } from 'ethers';

/**
 * Class representing the Trustless Bridge ROFL Oracle
 */
export class TrustlessBridgeOracle {
  private contractAddress: string;
  private bitcoinNetwork: string;
  private roflUtility: RoflUtility;
  private secret: string;
  private isRunning: boolean = false;
  private poolInterval: number = 20000; // 20 seconds
  private sapphireConnection: SapphireConnection | null = null;
  private bitcoinConnection: BitcoinConnection | null = null;
  private contractAbi: any;
  private eventListeners: { [key: string]: any } = {};

  /**
   * Constructor for TrustlessBridgeOracle
   * @param contractAddress - Address of the smart contract
   * @param bitcoinNetwork - Bitcoin network to connect to (mainnet, testnet)
   * @param roflUtility - Utility for ROFL services
   * @param secret - Secret key for the oracle
   */
  constructor(
    contractAddress: string,
    bitcoinNetwork: string,
    roflUtility: RoflUtility,
    secret: string
  ) {
    this.contractAddress = contractAddress;
    this.bitcoinNetwork = bitcoinNetwork;
    this.roflUtility = roflUtility;
    this.secret = secret;
    
    // Load the contract ABI
    try {
      const abiPath = path.resolve(__dirname, 'abi', 'TrustlessBTC.json');
      this.contractAbi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    } catch (error) {
      console.error('Failed to load contract ABI:', error);
      this.contractAbi = [];
    }
  }

  /**
   * Run the oracle
   */
  async run(): Promise<void> {
    console.log('Starting Trustless Bridge ROFL Oracle...');
    this.isRunning = true;

    try {
      // Initialize Sapphire connection
      await this.initializeSapphireConnection();
      
      // Initialize Bitcoin connection
      this.bitcoinConnection = new BitcoinConnection(this.bitcoinNetwork, "");
      
      console.log(`Connected to contract ${this.contractAddress}`);
      console.log(`Using Bitcoin ${this.bitcoinNetwork} network`);
      console.log('Oracle is running and listening for events...');

      // Set up event listeners
      this.setupEventListeners();

      // Keep the process running
      while (this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, this.poolInterval));
        console.log('Oracle is still running...');
      }
    } catch (error) {
      console.error('Error running oracle:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Initialize the Sapphire connection
   */
  private async initializeSapphireConnection(): Promise<void> {
    // Define RPC URLs based on the network
    const rpcUrls = this.getRpcUrls();
    
    // Create Sapphire connection
    this.sapphireConnection = new SapphireConnection(rpcUrls);
    
    // Connect to the network
    await this.sapphireConnection.connect();
    
    // Initialize wallet with private key
    this.sapphireConnection.initializeWallet(this.secret);
    
    // Connect to the contract
    this.sapphireConnection.connectToContract(this.contractAddress, this.contractAbi);
  }

  /**
   * Set up event listeners for the contract
   */
  private setupEventListeners(): void {
    if (!this.sapphireConnection) {
      throw new Error('Sapphire connection not initialized');
    }

    const contract = this.sapphireConnection.getContract();
    
    // Listen for TransactionProofSubmitted events
    this.eventListeners.transactionProofSubmitted = contract.on('TransactionProofSubmitted', 
      async (txHash, signature, ethereumAddress) => {
        console.log(`TransactionProofSubmitted event received: ${txHash}`);
        console.log(`Signature: ${signature}`);
        console.log(`Ethereum Address: ${ethereumAddress}`);
        
        try {
          // Check if Bitcoin connection is initialized
          if (!this.bitcoinConnection) {
            throw new Error('Bitcoin connection not initialized');
          }
          
          // Step 1: Fetch Bitcoin transaction information
          console.log(`Fetching Bitcoin transaction info for ${txHash}...`);
          const txInfo = await this.bitcoinConnection.fetchTransactionInfo(txHash);
          console.log(`Bitcoin transaction info:`, txInfo);
          
          // Step 2: Verify the signature against the transaction sender
          console.log(`Verifying signature for transaction ${txHash}...`);
          let isValid = false;
          if (txInfo.sender) {
              isValid = await this.bitcoinConnection.verifySignature(
              txHash, 
              signature, 
              ethereumAddress, 
              txInfo.sender
            );
          }
          if (isValid) {
            console.log(`Signature verification successful for transaction ${txHash}`);
            // Process the transaction information
            console.log(`Processing TransactionProofSubmitted for transaction ${txHash}`);
            // Additional processing logic can be added here
          } else {
            console.error(`Signature verification failed for transaction ${txHash}`);
            // Handle invalid signature case
            // For example, you might want to emit an event or take other actions
          }
        } catch (error) {
          console.error('Error handling TransactionProofSubmitted event:', error);
        }
      }
    );
    
    // Listen for BurnGenerateTransaction events
    this.eventListeners.burnGenerateTransaction = contract.on('BurnGenerateTransaction', 
      async (transactionId, amount, recipient, sender, event) => {
        console.log(`BurnGenerateTransaction event received: ${transactionId}`);
        console.log(`Amount: ${amount}`);
        console.log(`Recipient: ${recipient}`);
        console.log(`Sender: ${sender}`);
        
        try {
          // Handle the event here
          console.log(`Processing BurnGenerateTransaction for transaction ${transactionId}`);
        } catch (error) {
          console.error('Error handling BurnGenerateTransaction event:', error);
        }
      }
    );
    
    // Listen for BurnValidateTransaction events
    this.eventListeners.burnValidateTransaction = contract.on('BurnValidateTransaction', 
      async (transactionId, txHash, sender, event) => {
        console.log(`BurnValidateTransaction event received: ${transactionId}`);
        console.log(`Transaction Hash: ${txHash}`);
        console.log(`Sender: ${sender}`);
        
        try {
          // Handle the event here
          console.log(`Processing BurnValidateTransaction for transaction ${transactionId}`);
        } catch (error) {
          console.error('Error handling BurnValidateTransaction event:', error);
        }
      }
    );
    
    console.log('Event listeners set up successfully');
  }

  /**
   * Get RPC URLs based on the network
   * @returns Array of RPC URLs
   */
  private getRpcUrls(): string[] {
    // Default RPC URLs for Sapphire networks
    const rpcUrls: { [key: string]: string[] } = {
      'sapphire': [
        'https://sapphire.oasis.io',
        'https://sapphire-rpc.oasis.io'
      ],
      'sapphire-testnet': [
        'https://testnet.sapphire.oasis.io',
        'https://testnet.sapphire-rpc.oasis.io'
      ],
      'sapphire-localnet': [
        'http://localhost:8545'
      ]
    };
    
    // Get the network from environment or default to localnet
    const network = process.env.NETWORK || 'sapphire-localnet';
    
    // Return the RPC URLs for the network
    return rpcUrls[network] || rpcUrls['sapphire-localnet'];
  }

  /**
   * Stop the oracle
   */
  stop(): void {
    console.log('Stopping Trustless Bridge ROFL Oracle...');
    
    // Remove event listeners
    if (this.sapphireConnection) {
      const contract = this.sapphireConnection.getContract();
      
      // Remove all event listeners
      Object.keys(this.eventListeners).forEach(eventName => {
        contract.off(eventName, this.eventListeners[eventName]);
        console.log(`Removed event listener for ${eventName}`);
      });
    }
    
    this.isRunning = false;
  }
} 