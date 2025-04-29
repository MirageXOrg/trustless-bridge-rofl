import { RoflUtility } from './RoflUtility';
import { SapphireConnection } from './SapphireConnection';
import { BitcoinConnection, BitcoinTransactionInfo } from './BitcoinConnection';
import * as fs from 'fs';
import * as path from 'path';
import { Contract, ethers } from 'ethers';

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
      this.contractAbi = (JSON.parse(fs.readFileSync(abiPath, 'utf8'))).abi;
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

      const bitcoinAddress = await this.sapphireConnection?.getContract().bitcoinAddress();
      const oracleAddress = await this.sapphireConnection?.getContract().oracle();

      // Initialize Bitcoin connection
      this.bitcoinConnection = new BitcoinConnection(this.bitcoinNetwork, bitcoinAddress);

      console.log(await this.bitcoinConnection.getNetworkFeeRate());
      
      console.log(`Connected to contract ${this.contractAddress}, monitoring ${bitcoinAddress}`);
      console.log(`Using Oracle ${oracleAddress}`);
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
          const txInfo = await this.bitcoinConnection.fetchTransactionInfo(txHash.slice(2));
          console.log(`Bitcoin transaction info:`, txInfo);
          
          // Step 2: Verify the signature against the transaction sender
          console.log(`Verifying signature for transaction ${txHash}...`);
          let isValid = false;
          if (txInfo.sender && txInfo.sender.length == 1) {
              isValid = await this.bitcoinConnection.verifySignature(
              txHash+ethereumAddress, 
              signature,
              txInfo.sender[0]
            );
          }
          if (isValid) {
            console.log(`Signature verification successful for transaction ${txHash}`);
            // Process the transaction information
            console.log(`Processing TransactionProofSubmitted for transaction ${txHash}`);
            try {
              // Call the mint function on the contract
              const contract = this.sapphireConnection!.getContract();
              const mintTx = await contract.mint(
                ethereumAddress,
                txInfo.amount,
                txHash
              );
              console.log(`Mint transaction sent: ${mintTx.hash}`);
              await mintTx.wait();
              console.log('Mint transaction confirmed');
            } catch (mintError) {
              console.error('Error sending mint transaction:', mintError);
            }
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
      async (burnId, event) => {
        console.log(`BurnGenerateTransaction event received for burnId: ${burnId}`);
        
        try {
          // Fetch burn data from the contract
          const burnInfo = await contract.burnData(burnId);
          console.log('Burn Information:');
          console.log(`User: ${burnInfo.user}`);
          console.log(`Amount: ${burnInfo.amount}`);
          console.log(`Timestamp: ${burnInfo.timestamp}`);
          console.log(`Bitcoin Address: ${burnInfo.bitcoinAddress}`);
          console.log(`Status: ${burnInfo.status}`);
          console.log(`Transaction Hash: ${burnInfo.transactionHash}`);

          if (burnInfo.status == 1) {
            try {
              if (!this.bitcoinConnection) {
                throw new Error('Bitcoin connection not initialized');
              }

              // Generate and sign the Bitcoin transaction
              const { rawTxHex, txHash } = await this.bitcoinConnection.generateAndSignTransaction(
                burnInfo.bitcoinAddress,
                burnInfo.amount,
                this.sapphireConnection!
              );

              console.log(`Raw transaction hex: ${rawTxHex}`);
              const rawTx = ethers.toUtf8Bytes(rawTxHex);


              const updateTx = await contract.burnSigned(burnId, rawTx, `0x${txHash}`);
              await updateTx.wait();

              // Send the transaction to the Bitcoin network
              await this.bitcoinConnection.sendRawTransaction(rawTxHex);
              console.log(`Bitcoin transaction sent: ${txHash}`);

              
              console.log(`Burn status updated for burnId: ${burnId}`);
            } catch (error) {
              console.error('Error updating burn status:', error);
            }
          } else {
            console.log(`Burn skipped for burnId: ${burnId}`);
          }
          
        } catch (error) {
          console.error('Error handling BurnGenerateTransaction event:', error);
        }
      }
    );
    
    // Listen for BurnValidateTransaction events
    this.eventListeners.burnValidateTransaction = contract.on('BurnValidateTransaction', 
      async (burnId, event) => {
        console.log(`BurnValidateTransaction event received for burnId: ${burnId}`);
      
        try {
          const burnInfo = await contract.burnData(burnId);
          if (burnInfo.status == 2) {
          const txHash = burnInfo.transactionHash.slice(2);

          // Check if Bitcoin connection is initialized
          if (!this.bitcoinConnection) {
            throw new Error('Bitcoin connection not initialized');
          }

          // Fetch Bitcoin transaction information
          console.log(`Fetching Bitcoin transaction info for ${txHash}...`);
          const txInfo = await this.bitcoinConnection.fetchTransactionInfo(txHash);
          console.log(`Bitcoin transaction info:`, txInfo);

          // Check if transaction has 6 or more confirmations
          if (txInfo.confirmations >= 6) {
            console.log(`Transaction ${txHash} has ${txInfo.confirmations} confirmations, validating burn...`);
            const updateTx = await contract.validateBurn(burnId);
            await updateTx.wait();
            console.log(`Burn validated for burnId: ${burnId}`);
          } else {
            console.log(`Transaction ${txHash} has only ${txInfo.confirmations} confirmations, waiting for more confirmations...`);
            }
          }
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
    const network = process.env.NETWORK || 'sapphire-testnet';
    
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