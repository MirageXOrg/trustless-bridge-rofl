import { BitcoinNetwork } from './bitcoin/BitcoinNetwork';
import { BitcoinActions } from './bitcoin/BitcoinActions';
import { BitcoinRpcNode } from './bitcoin/BitcoinNetwork';
import { BitcoinTransactionInfo } from './bitcoin/BitcoinActions';
import { BitcoinApiConfig } from './config';
import Client = require('bitcoin-core');
import * as bitcoinMessage from 'bitcoinjs-message';
import { ethers } from 'ethers';
import {SiweMessage} from 'siwe';
import { SapphireConnection } from './SapphireConnection';

/**
 * Class for handling Bitcoin network connections and operations
 */
export class BitcoinConnection {
  private bitcoinNetwork: BitcoinNetwork;
  private bitcoinActions: BitcoinActions;
  private clients: Map<string, Client> = new Map();

  /**
   * Constructor for BitcoinConnection
   * @param bitcoinNetwork - Bitcoin network to connect to (mainnet, testnet)
   * @param trackedAddress - Bitcoin address to track for incoming transactions
   * @param rpcNodes - Optional list of Bitcoin RPC nodes to connect to
   * @param apiConfigs - Optional list of Bitcoin API configurations
   */
  constructor(
    bitcoinNetwork: string, 
    trackedAddress: string,
    rpcNodes?: BitcoinRpcNode[],
    apiConfigs?: BitcoinApiConfig[]
  ) {
    this.bitcoinNetwork = new BitcoinNetwork(bitcoinNetwork, rpcNodes, apiConfigs);
    this.bitcoinActions = new BitcoinActions(this.bitcoinNetwork, trackedAddress);
  }

  /**
   * Initialize connections to all RPC nodes
   */
  async initializeConnections(): Promise<void> {
    await this.bitcoinNetwork.initializeConnections();
  }

  /**
   * Fetch Bitcoin transaction information from multiple RPC nodes
   * @param txHash - Bitcoin transaction hash
   * @returns Bitcoin transaction information
   */
  async fetchTransactionInfo(txHash: string): Promise<BitcoinTransactionInfo> {
    return this.bitcoinActions.fetchTransactionInfo(txHash);
  }

  /**
   * Get all UTXOs for the tracked address
   * @returns Array of UTXOs
   */
  async getAllUtxos(): Promise<any[]> {
    return this.bitcoinActions.getAllUtxos();
  }

  /**
   * Fetch raw transaction hex for a given txid
   * @param txid - Transaction ID
   * @returns Raw transaction hex
   */
  async fetchRawTx(txid: string): Promise<string> {
    return this.bitcoinActions.fetchRawTx(txid);
  }

  /**
   * Generate and sign a Bitcoin transaction
   * @param destinationAddress - Destination Bitcoin address
   * @param amountSat - Amount to send in satoshis
   * @param sapphireConnection - Sapphire connection for signing
   * @returns Object containing raw transaction hex and transaction hash
   */
  async generateAndSignTransaction(
    destinationAddress: string,
    amountSat: number | bigint,
    sapphireConnection: any
  ): Promise<{ rawTxHex: string; txHash: string }> {
    return this.bitcoinActions.generateAndSignTransaction(
      destinationAddress,
      amountSat,
      sapphireConnection
    );
  }

  /**
   * Send a raw transaction to the Bitcoin network
   * @param rawTxHex - Raw transaction hex
   * @returns Transaction ID
   */
  async sendRawTransaction(rawTxHex: string): Promise<string> {
    return this.bitcoinActions.sendRawTransaction(rawTxHex);
  }

  /**
   * Verify a Bitcoin signature against a transaction
   * @param message - The message that was signed
   * @param signature - Signature to verify
   * @param signerAddress - Bitcoin address of the signer (from transaction)
   * @returns Whether the signature is valid and matches the transaction sender
   */
  async verifySignature(message: string, signature: string, signerAddress: string): Promise<boolean> {
    try {
      console.log('[Bitcoin] Verifying transaction signature');
      
      // Verify the signature directly using bitcoinjs-message
      // For Electrum segwit signatures, we need to pass checkSegwitAlways=true
      const isValid = bitcoinMessage.verify(message, signerAddress, signature, this.bitcoinNetwork.network.messagePrefix, true);
      
      if (isValid) {
        console.log('[Bitcoin] Signature verification successful');
      } else {
        console.error('Signature verification failed: Address does not match signer');
      }
      
      return isValid;
    } catch (error) {
      console.error('Error verifying signature:', error);
      return false;
    }
  }

  /**
   * Get the current network fee rate from the Bitcoin node
   * @returns Fee rate in satoshis per byte
   */
  public async getNetworkFeeRate(): Promise<number> {
    if (this.clients.size === 0) {
      await this.initializeConnections();
    }

    const client = Array.from(this.clients.values())[0];
    try {
      // Use command method to make raw RPC call to estimatesmartfee
      const feeInfo = await (client as any).command('estimatesmartfee', 1);
      if (feeInfo.feerate) {
        // Convert BTC/kB to satoshis/byte
        const feeRate = Math.ceil(feeInfo.feerate * 100000000 / 1000);
        
        // For testnet, cap the fee rate at 5 satoshis/byte
        if (this.bitcoinNetwork.bitcoinNetwork === 'testnet') {
          return Math.min(feeRate, 5)
        }
        
        return feeRate;
      }
    } catch (error) {
      console.error('Error getting network fee rate:', error);
    }
    
    // Fallback to a conservative fee rate if we can't get it from the node
    return this.bitcoinNetwork.bitcoinNetwork === 'testnet' ? 2 : 5; // 2 satoshis per byte for testnet, 5 for mainnet
  }

  /**
   * Calculate transaction amounts including fees
   * @param utxoAmountSat - Total amount of UTXOs in satoshis
   * @param amountToSendSat - Amount to send in satoshis
   * @param feeRateSatPerByte - Fee rate in satoshis per byte
   * @param estimatedTxSizeBytes - Estimated transaction size in bytes
   * @returns Object containing amount to send, change, and fee
   */
  async calculateAmounts(
    utxoAmountSat: number | bigint,
    amountToSendSat: number | bigint,
    numInputs: number,
    numOutputs: number = 2 // Default to 2 outputs (destination + change)
  ): Promise<{ amountToSendSat: bigint; change: bigint; fee: bigint }> {
    // Get current network fee rate
    const feeRateSatPerByte = await this.getNetworkFeeRate();
    
    // Calculate transaction size
    // Base transaction size: 10 bytes
    // Input size: ~148 bytes per input (P2PKH)
    // Output size: ~34 bytes per output
    const baseTxSize = 10;
    const inputSize = 148;
    const outputSize = 34;
    const estimatedTxSizeBytes = baseTxSize + (inputSize * numInputs) + (outputSize * numOutputs);
    
    // Add 20% safety margin to ensure we have enough fee
    const feeWithMargin = Math.ceil(estimatedTxSizeBytes * feeRateSatPerByte * 1.2);
    
    // Convert all values to BigInt for consistent calculations
    const utxoAmount = BigInt(utxoAmountSat);
    const amountToSend = BigInt(amountToSendSat);
    const fee = BigInt(feeWithMargin);
    
    const change = utxoAmount - amountToSend - fee;
    if (change < 0n) {
      throw new Error("Not enough funds to cover destination + fee.");
    }
    return { 
      amountToSendSat: amountToSend, 
      change, 
      fee 
    };
  }

  async siweLogin(sapphireConnection: SapphireConnection): Promise<any> {
    const contract = sapphireConnection.getContract();
    const wallet = sapphireConnection.getWrappedWallet();
    const domain = await contract.domain();

    const siweMsg = new SiweMessage({
        domain,
        address: wallet.address,
        statement: "Sign in with Ethereum to access the TrustlessBTC contract",
        uri: `http://${domain}`,
        version: "1",
        chainId: Number((await contract.runner?.provider?.getNetwork())?.chainId)
    }).toMessage();

    const signature = await wallet.signMessage(siweMsg);
    const sig = ethers.Signature.from(signature);
    const token = await contract.login(siweMsg, sig);

    return token;
  }

} 