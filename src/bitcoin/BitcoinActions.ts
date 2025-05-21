import * as bitcoin from 'bitcoinjs-lib';
import { BN } from 'bn.js';
import axios from 'axios';
import { ethers } from 'ethers';
import { SiweMessage } from 'siwe';
import { BitcoinNetwork } from './BitcoinNetwork';
import { SapphireConnection } from '../SapphireConnection';
import { encodeDerSignature, toPositiveBuffer } from './BitcoinUtils';

/**
 * Interface for Bitcoin transaction information
 */
export interface BitcoinTransactionInfo {
  txHash: string;
  amount: number; // Amount in satoshis (1 BTC = 100,000,000 satoshis)
  sender: string[] | null; // Array of sender addresses or null if none can be extracted
  receiver: string | null; // Can be null if the tracked address is not a receiver
  confirmations: number;
  provider: string;
  timestamp?: number; // Optional timestamp of the transaction
  blockHeight?: number; // Optional block height
}

/**
 * Class for handling Bitcoin transaction actions
 */
export class BitcoinActions {
  private bitcoinNetwork: BitcoinNetwork;
  private trackedAddress: string;

  /**
   * Constructor for BitcoinActions
   * @param bitcoinNetwork - Bitcoin network instance
   * @param trackedAddress - Bitcoin address to track for incoming transactions
   */
  constructor(
    bitcoinNetwork: BitcoinNetwork,
    trackedAddress: string
  ) {
    this.bitcoinNetwork = bitcoinNetwork;
    this.trackedAddress = trackedAddress;
  }

  /**
   * Get all UTXOs for the tracked address
   * @returns Array of UTXOs
   */
  async getAllUtxos(): Promise<any[]> {
    const apiConfigs = this.bitcoinNetwork.bitcoinApiConfigs;
    let lastError: Error | null = null;

    for (const config of apiConfigs) {
      try {
        console.log(`[Bitcoin] Fetching UTXOs from: ${config.name}`);
        const response = await axios.get(`${config.url}/address/${this.trackedAddress}/utxo`, {
          timeout: config.timeout
        });

        if (!response.data || response.data.length === 0) {
          throw new Error("No UTXOs available");
        }

        console.log(`[Bitcoin] UTXOs fetched from: ${config.name}`);
        return response.data;
      } catch (error) {
        console.error(`Failed to fetch UTXOs from ${config.name}:`, error);
        lastError = error as Error;
        // Continue to next API if available
      }
    }

    // If we get here, all APIs failed
    throw new Error(`Failed to fetch UTXOs from all APIs. Last error: ${lastError?.message}`);
  }

  /**
   * Fetch raw transaction hex for a given txid
   * @param txid - Transaction ID
   * @returns Raw transaction hex
   */
  async fetchRawTx(txid: string): Promise<string> {
    const client = this.bitcoinNetwork.getClient();
    const rawTx = await (client as any).getRawTransaction(txid);
    return rawTx;
  }

  /**
   * Calculate transaction amounts including fees
   * @param utxoAmountSat - Total amount of UTXOs in satoshis
   * @param amountToSendSat - Amount to send in satoshis
   * @param numInputs - Number of inputs in the transaction
   * @param numOutputs - Number of outputs in the transaction (default: 2)
   * @returns Object containing amount to send, change, and fee
   */
  async calculateAmounts(
    utxoAmountSat: number | bigint,
    amountToSendSat: number | bigint,
    numInputs: number,
    numOutputs: number = 2 // Default to 2 outputs (destination + change)
  ): Promise<{ amountToSendSat: bigint; change: bigint; fee: bigint }> {
    // Get current network fee rate
    const feeRateSatPerByte = await this.bitcoinNetwork.getNetworkFeeRate();
    
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
    sapphireConnection: SapphireConnection
  ): Promise<{ rawTxHex: string; txHash: string }> {
    const network = this.bitcoinNetwork.network;
    const psbt = new bitcoin.Psbt({ network });

    // Get UTXOs
    const utxos = await this.getAllUtxos();
    if (utxos.length === 0) {
      throw new Error("No UTXOs available");
    }

    // Calculate total balance
    const totalBalance = utxos.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n);

    console.log(`[Bitcoin] Total balance: ${totalBalance} satoshis`);
    console.log("UTXOs:", utxos);
    
    // Calculate amounts including fees
    const { amountToSendSat, change, fee } = await this.calculateAmounts(
      totalBalance,
      amountSat,
      utxos.length
    );

    // Add inputs
    for (const utxo of utxos) {
      const rawTxHex = await this.fetchRawTx(utxo.txid);
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(rawTxHex, 'hex'),
      });
    }

    // Add outputs
    psbt.addOutput({
      address: destinationAddress,
      value: Number(amountToSendSat),
    });
    psbt.addOutput({
      address: this.trackedAddress,
      value: Number(change),
    });

    const token = await this.siweLogin(sapphireConnection);
    const contract = sapphireConnection.getContract();
    // Get public key from contract
    const pubKeyHex = await contract.publicKey();
    const pubKeyBuffer = Buffer.from(pubKeyHex.startsWith('0x') ? pubKeyHex.slice(2) : pubKeyHex, 'hex');
    // Sign each input
    for (let i = 0; i < utxos.length; i++) {
      const tx = (psbt as any).__CACHE.__TX;
      const sighashType = bitcoin.Transaction.SIGHASH_ALL;
      const utxoScript = bitcoin.address.toOutputScript(this.trackedAddress, network);
      const sighash = tx.hashForSignature(i, utxoScript, sighashType);

      // Call contract to sign the sighash
      const sighashHex = '0x' + sighash.toString('hex');
      const { nonce, r, s, v } = await contract.sign(sighashHex, token);

      // Convert r, s to Buffer
      let rBuf = Buffer.from(r.toString(16).padStart(64, '0'), 'hex');
      let sBuf = Buffer.from(s.toString(16).padStart(64, '0'), 'hex');
      rBuf = toPositiveBuffer(rBuf);
      sBuf = toPositiveBuffer(sBuf);
      
      const derSig = Buffer.concat([
        encodeDerSignature(new BN(rBuf), new BN(sBuf)),
        Buffer.from([sighashType])
      ]);

      psbt.updateInput(i, {
        partialSig: [{
          pubkey: pubKeyBuffer,
          signature: derSig
        }]
      });
      psbt.finalizeInput(i);
    }

    const rawTxHex = psbt.extractTransaction().toHex();
    const txHash = bitcoin.Transaction.fromHex(rawTxHex).getId();

    return { rawTxHex, txHash };
  }

  /**
   * Send a raw transaction to the Bitcoin network
   * @param rawTxHex - Raw transaction hex
   * @returns Transaction ID
   */
  async sendRawTransaction(rawTxHex: string): Promise<string> {
    const client = this.bitcoinNetwork.getClient();
    const txid = await (client as any).sendRawTransaction(rawTxHex);
    return txid;
  }

  /**
   * Perform SIWE login for contract interaction
   * @param sapphireConnection - Sapphire connection instance
   * @returns Authentication token
   */
  private async siweLogin(sapphireConnection: SapphireConnection): Promise<any> {
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

  /**
   * Fetch transaction information from multiple APIs with fallback
   * @param txHash - Transaction hash to fetch
   * @returns Transaction information
   */
  async fetchTransactionInfo(txHash: string): Promise<BitcoinTransactionInfo> {
    const apiConfigs = this.bitcoinNetwork.bitcoinApiConfigs;
    let lastError: Error | null = null;

    for (const config of apiConfigs) {
      try {
        const response = await axios.get(`${config.url}/tx/${txHash}`, {
          timeout: config.timeout
        });

        if (!response.data) {
          throw new Error("No transaction data available");
        }

        const tx = response.data;
        
        let totalAmount = 0;
        let isTrackedAddressReceiver = false;
        const senders: string[] = [];

        // Process outputs
        for (const output of tx.vout) {
          if ((output.scriptPubKey && output.scriptPubKey.address === this.trackedAddress) || (output.scriptpubkey_address && output.scriptpubkey_address === this.trackedAddress)) {
            // Check if value is in BTC (decimal) or satoshis (whole number)
            const value = output.value;
            if (Number.isInteger(value)) {
              // Value is already in satoshis
              totalAmount += value;
            } else {
              // Value is in BTC, convert to satoshis
              totalAmount += Math.round(value * 100000000);
            }
            isTrackedAddressReceiver = true;
          }
        }

        for (const input of tx.vin) {
          if (input.prevout && input.prevout.scriptpubkey_address) {
            const sender = input.prevout.scriptpubkey_address;
            if (!senders.includes(sender)) {
              senders.push(sender);
            }
          }
        }

        return {
          txHash,
          amount: isTrackedAddressReceiver ? totalAmount : 0,
          sender: senders.length > 0 ? senders : null,
          receiver: isTrackedAddressReceiver ? this.trackedAddress : null,
          confirmations: tx.status?.block_height ? 
            (await this.getCurrentBlockHeight()) - tx.status.block_height + 1 : 0,
          provider: config.name,
          timestamp: tx.status?.block_time,
          blockHeight: tx.status?.block_height
        };
      } catch (error) {
        console.error(`Failed to fetch transaction info from ${config.name}:`, error);
        lastError = error as Error;
        // Continue to next API if available
      }
    }

    // If we get here, all APIs failed
    throw new Error(`Failed to fetch transaction info from all APIs. Last error: ${lastError?.message}`);
  }

  /**
   * Get current block height from any available API
   * @returns Current block height
   */
  private async getCurrentBlockHeight(): Promise<number> {
    const apiConfigs = this.bitcoinNetwork.bitcoinApiConfigs;
    let lastError: Error | null = null;

    for (const config of apiConfigs) {
      try {
        const response = await axios.get(`${config.url}/blocks/tip/height`, {
          timeout: config.timeout
        });
        return response.data;
      } catch (error) {
        console.error(`Failed to get block height from ${config.name}:`, error);
        lastError = error as Error;
      }
    }

    throw new Error(`Failed to get block height from all APIs. Last error: ${lastError?.message}`);
  }
} 