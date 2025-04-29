import { RoflUtility } from './RoflUtility';
import { SapphireConnection } from './SapphireConnection';
import { BitcoinConnection } from './BitcoinConnection';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { getSapphireRpcUrls } from './config';

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

  async setOracle(): Promise<void> {
    const oracleAddress = await this.sapphireConnection?.getContract().oracle();
    const walletAddress = this.sapphireConnection?.getWallet().address;

    if (oracleAddress != walletAddress) { 
      console.log(`[Oracle] Updating contract oracle from ${oracleAddress} to ${walletAddress}`);
      
      try {
        const contract = this.sapphireConnection!.getContract();
        const tx = await contract.setOracle.populateTransaction(walletAddress);
        
        const txParams = {
          gas: tx.gasLimit?.toString() || '100000',
          to: this.contractAddress,
          value: '0',
          data: tx.data || '0x'
        };
        
        const txHash = await this.roflUtility.submitTx(txParams);
        console.log(`[Oracle] Update transaction sent: ${txHash}`);
        
        const receipt = await this.sapphireConnection!.getProvider().waitForTransaction(txHash);
        console.log(`[Oracle] Update confirmed: ${receipt.transactionHash}`);
      } catch (error) {
        console.error('Error updating oracle:', error);
        throw error;
      }
    }
    console.log(`[Oracle] Using oracle address: ${oracleAddress}`);
  }

  /**
   * Run the oracle
   */
  async run(): Promise<void> {
    console.log('[Oracle] Service starting...');
    this.isRunning = true;

    try {
      // Initialize Sapphire connection
      await this.initializeSapphireConnection();
      await this.setOracle();

      const bitcoinAddress = await this.sapphireConnection?.getContract().bitcoinAddress();

      // Initialize Bitcoin connection
      this.bitcoinConnection = new BitcoinConnection(this.bitcoinNetwork, bitcoinAddress);
      
      console.log(`[Oracle] Connected to contract ${this.contractAddress}`);
      console.log(`[Oracle] Monitoring Bitcoin address: ${bitcoinAddress}`);
      console.log(`[Oracle] Using Bitcoin network: ${this.bitcoinNetwork}`);
      console.log('Oracle is running and listening for events...');

      // Set up event listeners
      this.setupEventListeners();

      // Keep the process running
      while (this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, this.poolInterval));
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
    // Get RPC URLs from environment or defaults
    const network = process.env.NETWORK || 'testnet';
    const rpcUrls = getSapphireRpcUrls(network);
    
    // Create Sapphire connection
    this.sapphireConnection = new SapphireConnection(rpcUrls);
    
    // Connect to the network
    await this.sapphireConnection.connect();
    
    // Initialize wallet with private key
    this.sapphireConnection.initializeWallet(this.secret);
    
    // Connect to the contract
    this.sapphireConnection.connectToContract(this.contractAddress, this.contractAbi);

    console.log('[Oracle] Event listeners initialized');
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
      this.handleTransactionProofSubmitted.bind(this)
    );
    
    // Listen for BurnGenerateTransaction events
    this.eventListeners.burnGenerateTransaction = contract.on('BurnGenerateTransaction', 
      this.handleBurnGenerateTransaction.bind(this)
    );
    
    // Listen for BurnValidateTransaction events
    this.eventListeners.burnValidateTransaction = contract.on('BurnValidateTransaction', 
      this.handleBurnValidateTransaction.bind(this)
    );
  }

  private async handleTransactionProofSubmitted(txHash: string, signature: string, ethereumAddress: string): Promise<void> {
    console.log(`[Oracle] Received TransactionProofSubmitted: ${txHash}`);
    
    try {
      // Check if Bitcoin connection is initialized
      if (!this.bitcoinConnection) {
        throw new Error('Bitcoin connection not initialized');
      }
      
      // Step 1: Fetch Bitcoin transaction information
      const txInfo = await this.bitcoinConnection.fetchTransactionInfo(txHash.slice(2));
      console.log(`Bitcoin transaction info:`, txInfo);
      
      // Step 2: Verify the signature against the transaction sender
      console.log(`[Oracle] Signature verified: ${txHash}`);
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
        await this.processValidTransactionProof(txHash, ethereumAddress, txInfo.amount);
      } else {
        console.error(`Signature verification failed for transaction ${txHash}`);
      }
    } catch (error) {
      console.error('Error handling TransactionProofSubmitted event:', error);
    }
  }

  private async processValidTransactionProof(txHash: string, ethereumAddress: string, amount: number): Promise<void> {
    try {
      const contract = this.sapphireConnection!.getContract();
      const mintTx = await contract.mint(
        ethereumAddress,
        amount,
        txHash
      );
      console.log(`[Oracle] Mint transaction sent: ${mintTx.hash}`);
      await mintTx.wait();
      console.log(`[Oracle] Mint confirmed: ${mintTx.hash}`);
    } catch (mintError) {
      console.error('Error sending mint transaction:', mintError);
    }
  }

  private async handleBurnGenerateTransaction(burnId: string): Promise<void> {
    console.log(`[Oracle] Received BurnGenerateTransaction: ${burnId}`);
    
    try {
      const contract = this.sapphireConnection!.getContract();
      const burnInfo = await contract.burnData(burnId);
      console.log(`[Oracle] Burn details - ID: ${burnId}, User: ${burnInfo.user}, Amount: ${burnInfo.amount}`);

      if (burnInfo.status == 1) {
        await this.processBurnGeneration(burnId, burnInfo);
      } else {
        console.log(`[Oracle] Skipping burn: ${burnId}`);
      }
    } catch (error) {
      console.error('Error handling BurnGenerateTransaction event:', error);
    }
  }

  private async processBurnGeneration(burnId: string, burnInfo: any): Promise<void> {
    try {
      if (!this.bitcoinConnection) {
        throw new Error('Bitcoin connection not initialized');
      }

      const contract = this.sapphireConnection!.getContract();
      const { rawTxHex, txHash } = await this.bitcoinConnection.generateAndSignTransaction(
        burnInfo.bitcoinAddress,
        burnInfo.amount,
        this.sapphireConnection!
      );

      console.log(`[Oracle] Generated Bitcoin transaction: ${rawTxHex}`);
      const rawTx = ethers.toUtf8Bytes(rawTxHex);

      const updateTx = await contract.burnSigned(burnId, rawTx, `0x${txHash}`);
      await updateTx.wait();

      await this.bitcoinConnection.sendRawTransaction(rawTxHex);
      console.log(`[Oracle] Bitcoin transaction sent: ${txHash}`);
      console.log(`[Oracle] Burn status updated: ${burnId}`);
    } catch (error) {
      console.error('Error updating burn status:', error);
    }
  }

  private async handleBurnValidateTransaction(burnId: string): Promise<void> {
    console.log(`[Oracle] Received BurnValidateTransaction: ${burnId}`);
  
    try {
      const contract = this.sapphireConnection!.getContract();
      const burnInfo = await contract.burnData(burnId);
      if (burnInfo.status == 2) {
        await this.validateBurnTransaction(burnId, burnInfo);
      }
    } catch (error) {
      console.error('Error handling BurnValidateTransaction event:', error);
    }
  }

  private async validateBurnTransaction(burnId: string, burnInfo: any): Promise<void> {
    const txHash = burnInfo.transactionHash.slice(2);

    if (!this.bitcoinConnection) {
      throw new Error('Bitcoin connection not initialized');
    }

    console.log(`[Oracle] Fetching Bitcoin transaction: ${txHash}`);
    const txInfo = await this.bitcoinConnection.fetchTransactionInfo(txHash);
    console.log(`Bitcoin transaction info:`, txInfo);

    if (txInfo.confirmations >= 6) {
      console.log(`[Oracle] Transaction ${txHash} has ${txInfo.confirmations} confirmations`);
      const contract = this.sapphireConnection!.getContract();
      const updateTx = await contract.validateBurn(burnId);
      await updateTx.wait();
      console.log(`[Oracle] Burn validated: ${burnId}`);
    } else {
      console.log(`[Oracle] Waiting for more confirmations: ${txHash} (${txInfo.confirmations})`);
    }
  }

  /**
   * Stop the oracle
   */
  stop(): void {
    console.log('[Oracle] Service stopping...');
    
    // Remove event listeners
    if (this.sapphireConnection) {
      const contract = this.sapphireConnection.getContract();
      
      // Remove all event listeners
      Object.keys(this.eventListeners).forEach(eventName => {
        contract.off(eventName, this.eventListeners[eventName]);
        console.log(`[Oracle] Removed event listener: ${eventName}`);
      });
    }
    
    this.isRunning = false;
  }
} 