import Client = require('bitcoin-core');
import * as bitcoin from 'bitcoinjs-lib';
import * as bitcoinMessage from 'bitcoinjs-message';
import { BN } from 'bn.js';
import * as bip66 from 'bip66';
import axios from 'axios';
import { Contract, ethers } from 'ethers';
import {SiweMessage} from 'siwe';
import { SapphireConnection } from './SapphireConnection';

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

interface BlockstreamUtxo {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
  status?: {
    block_height: number;
  };
}

interface TransformedUtxo {
  txid: string;
  vout: number;
  amount: number;
  scriptPubKey: string;
  confirmations: number;
}

/**
 * Class for handling Bitcoin network connections and operations
 */
export class BitcoinConnection {
  private bitcoinNetwork: string;
  private rpcNodes: BitcoinRpcNode[];
  private network: bitcoin.networks.Network;
  private trackedAddress: string;
  private clients: Map<string, Client> = new Map();

  /**
   * Constructor for BitcoinConnection
   * @param bitcoinNetwork - Bitcoin network to connect to (mainnet, testnet)
   * @param trackedAddress - Bitcoin address to track for incoming transactions
   * @param rpcNodes - List of Bitcoin RPC nodes to connect to
   */
  constructor(
    bitcoinNetwork: string, 
    trackedAddress: string,
    rpcNodes: BitcoinRpcNode[] = []
  ) {
    this.bitcoinNetwork = bitcoinNetwork;
    this.trackedAddress = trackedAddress;
    
    // Set Bitcoin network
    this.network = this.bitcoinNetwork === 'testnet' 
      ? bitcoin.networks.testnet 
      : bitcoin.networks.bitcoin;
    
    // Set default RPC nodes if none provided
    if (rpcNodes.length === 0) {
      this.rpcNodes = [
        {
          url: 'https://bitcoin-testnet-rpc.publicnode.com',
          username: '',
          password: '',
          name: 'public-node',
          ssl: true
        }
      ];
    } else {
      this.rpcNodes = rpcNodes;
    }
  }

  /**
   * Initialize connections to all RPC nodes
   */
  async initializeConnections(): Promise<void> {
    console.log('Initializing connections to Bitcoin RPC nodes...');
    
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
        
        console.log(`Successfully connected to ${node.name || node.url}`);
      } catch (error) {
        console.error(`Failed to connect to ${node.name || node.url}:`, error);
      }
    }
    
    if (this.clients.size === 0) {
      throw new Error('Failed to connect to any Bitcoin RPC nodes');
    }
  }

  /**
   * Fetch Bitcoin transaction information from multiple RPC nodes
   * @param txHash - Bitcoin transaction hash
   * @returns Bitcoin transaction information
   */
  async fetchTransactionInfo(txHash: string): Promise<BitcoinTransactionInfo> {
    console.log(`Fetching Bitcoin transaction info for ${txHash} from multiple nodes...`);
    
    // Initialize connections if not already done
    if (this.clients.size === 0) {
      await this.initializeConnections();
    }
    
    // Fetch transaction info from all nodes in parallel
    const nodePromises = Array.from(this.clients.entries()).map(([nodeName, client]) => 
      this.fetchFromNode(nodeName, client, txHash)
    );
    
    // Wait for all nodes to respond
    const results = await Promise.allSettled(nodePromises);
    
    // Filter out failed requests and null results
    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<BitcoinTransactionInfo | null> => 
        result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value as BitcoinTransactionInfo);
    
    if (successfulResults.length === 0) {
      throw new Error(`Failed to fetch transaction info from any node for ${txHash}`);
    }
    
    // Check if all nodes returned the same information
    const isConsistent = this.areResultsConsistent(successfulResults);
    
    if (!isConsistent) {
      console.warn(`Inconsistent transaction information received for ${txHash}`);
      console.warn('Results:', successfulResults);
    }
    
    // Return the most common result (or the first one if all are different)
    return this.getMostCommonResult(successfulResults);
  }

  /**
   * Fetch transaction information from a specific node
   * @param nodeName - Name of the node
   * @param client - Bitcoin Core client
   * @param txHash - Bitcoin transaction hash
   * @returns Bitcoin transaction information
   */
  private async fetchFromNode(nodeName: string, client: Client, txHash: string): Promise<BitcoinTransactionInfo | null> {
    try {
      console.log(`Fetching from node: ${nodeName}`);
      
      // Get raw transaction with verbose output
      const tx = await (client as any).getRawTransaction(txHash, 1);
      
      if (!tx) {
        throw new Error(`Transaction ${txHash} not found`);
      }
      
      // Calculate amount for tracked address and find if it's a receiver
      let totalAmount = 0;
      let isTrackedAddressReceiver = false;
      
      // Check each output
      for (const output of tx.vout) {
        // Check if this output is for our tracked address
        if (output.scriptPubKey && output.scriptPubKey.address === this.trackedAddress) {
          totalAmount += Math.round(output.value * 100000000); // Convert BTC to satoshis
          isTrackedAddressReceiver = true;
        }
      }

      // Get the sender addresses from all inputs
      const senders: string[] = [];
      
      if (tx.vin && tx.vin.length > 0) {
        // Process each input to extract sender addresses
        for (const input of tx.vin) {
          let sender = null;
          
          // Method 1: Try to get the address directly from the input
          if (input.address) {
            sender = input.address;
          }
          // Method 2: For Taproot transactions (empty scriptSig.hex)
          else if (input.scriptSig && input.scriptSig.hex === '') {
            try {
              // Get the previous transaction
              const prevTx = await (client as any).getRawTransaction(input.txid, 1);
              
              if (prevTx && prevTx.vout && prevTx.vout.length > input.vout) {
                const prevOutput = prevTx.vout[input.vout];
                
                if (prevOutput && prevOutput.scriptPubKey && prevOutput.scriptPubKey.address) {
                  sender = prevOutput.scriptPubKey.address;
                }
              }
            } catch (e) {
              console.error('Error fetching previous transaction:', e);
            }
          }
          // Method 3: For SegWit transactions (with witness data)
          else if (input.txinwitness && input.txinwitness.length > 0) {
            try {
              // For P2WPKH, the public key is in the second element of the witness array
              if (input.txinwitness.length > 1) {
                const pubKeyHex = input.txinwitness[1];
                if (pubKeyHex) {
                  const pubKeyBuffer = Buffer.from(pubKeyHex, 'hex');
                  
                  // For P2WPKH, use p2wpkh
                  const { address } = bitcoin.payments.p2wpkh({ 
                    pubkey: pubKeyBuffer,
                    network: this.network
                  });
                  
                  if (address) {
                    sender = address;
                  }
                }
              }
              // For P2WSH, we need to get the script hash from the first element
              else if (input.txinwitness.length === 1) {
                const scriptHex = input.txinwitness[0];
                if (scriptHex) {
                  const scriptBuffer = Buffer.from(scriptHex, 'hex');
                  const scriptHash = bitcoin.crypto.sha256(scriptBuffer);
                  
                  // For P2WSH, use p2wsh
                  const { address } = bitcoin.payments.p2wsh({ 
                    hash: scriptHash,
                    network: this.network
                  });
                  
                  if (address) {
                    sender = address;
                  }
                }
              }
            } catch (e) {
              console.error('Error processing witness data:', e);
            }
          }
          // Method 4: For P2PKH and P2SH transactions (with scriptSig)
          else if (input.scriptSig && input.scriptSig.asm) {
            try {
              // For P2PKH, the public key is in the last part of the scriptSig.asm
              // Format is typically: <signature> <pubkey>
              const scriptParts = input.scriptSig.asm.split(' ');
              
              // The public key is the last part
              if (scriptParts.length > 0) {
                const pubKeyHex = scriptParts[scriptParts.length - 1];
                
                // Remove the [ALL] suffix if present
                const cleanPubKeyHex = pubKeyHex.replace(/\[ALL\]$/, '');
                
                if (cleanPubKeyHex && cleanPubKeyHex.length > 0) {
                  // For P2PKH, we need to hash the public key
                  const pubKeyBuffer = Buffer.from(cleanPubKeyHex, 'hex');
                  const pubKeyHash = bitcoin.crypto.hash160(pubKeyBuffer);
                  
                  // Create the address from the hash
                  const { address } = bitcoin.payments.p2pkh({ 
                    hash: pubKeyHash,
                    network: this.network
                  });
                  
                  if (address) {
                    sender = address;
                  }
                }
              }
              
              // If we still don't have a sender, try to get the previous transaction
              if (!sender) {
                try {
                  const prevTx = await (client as any).getRawTransaction(input.txid, 1);
                  
                  if (prevTx && prevTx.vout && prevTx.vout.length > input.vout) {
                    const prevOutput = prevTx.vout[input.vout];
                    
                    if (prevOutput && prevOutput.scriptPubKey && prevOutput.scriptPubKey.address) {
                      sender = prevOutput.scriptPubKey.address;
                    }
                  }
                } catch (e) {
                  console.error('Error fetching previous transaction:', e);
                }
              }
            } catch (e) {
              console.error('Error processing scriptSig:', e);
            }
          }
          
          // Add the sender to the array if found and not already included
          if (sender && !senders.includes(sender)) {
            senders.push(sender);
          }
        }
      }
      
      // Get additional transaction details
      let timestamp = undefined;
      let blockHeight = undefined;
      
      if (tx.blockhash) {
        try {
          const block = await (client as any).getBlock(tx.blockhash);
          if (block) {
            timestamp = block.time;
            blockHeight = block.height;
          }
        } catch (e) {
          console.error('Error fetching block details:', e);
        }
      }
      
      return {
        txHash,
        amount: isTrackedAddressReceiver ? totalAmount : 0,
        sender: senders.length > 0 ? senders : null,
        receiver: isTrackedAddressReceiver ? this.trackedAddress : null,
        confirmations: tx.confirmations || 0,
        provider: nodeName,
        timestamp,
        blockHeight
      };
    } catch (error) {
      console.error(`RPC Error from ${nodeName}:`, error);
      return null;
    }
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
      console.log('Verifying signature:', {
        message,
        signature,
        signerAddress
      });
      
      // Format the signature to be compatible with bitcoinjs-message
      // const formattedSignature = this.formatSignature(signature);
      // console.log('Formatted signature:', formattedSignature);
      
      // Verify the signature directly using bitcoinjs-message
      // For Electrum segwit signatures, we need to pass checkSegwitAlways=true
      const isValid = bitcoinMessage.verify(message, signerAddress, signature, this.network.messagePrefix, true);
      
      if (isValid) {
        console.log('Signature verification successful: Address matches signer');
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
   * Check if all results are consistent
   * @param results - Array of transaction information from different nodes
   * @returns Whether all results are consistent
   */
  private areResultsConsistent(results: BitcoinTransactionInfo[]): boolean {
    if (results.length <= 1) {
      return true;
    }
    
    // Compare the first result with all others
    const firstResult = results[0];
    
    return results.every(result => 
      result.amount === firstResult.amount &&
      JSON.stringify(result.sender) === JSON.stringify(firstResult.sender) &&
      result.receiver === firstResult.receiver &&
      result.confirmations === firstResult.confirmations
    );
  }

  /**
   * Get the most common result from a list of results
   * @param results - Array of transaction information from different nodes
   * @returns The most common result
   */
  private getMostCommonResult(results: BitcoinTransactionInfo[]): BitcoinTransactionInfo {
    if (results.length === 0) {
      throw new Error('No results to process');
    }
    
    if (results.length === 1) {
      return results[0];
    }
    
    // Count occurrences of each result
    const counts = new Map<string, { count: number, result: BitcoinTransactionInfo }>();
    
    results.forEach(result => {
      const key = `${result.amount}-${JSON.stringify(result.sender)}-${result.receiver}-${result.confirmations}`;
      
      if (counts.has(key)) {
        counts.get(key)!.count++;
      } else {
        counts.set(key, { count: 1, result });
      }
    });
    
    // Find the result with the highest count
    let maxCount = 0;
    let mostCommonResult = results[0];
    
    counts.forEach(({ count, result }) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonResult = result;
      }
    });
    
    return mostCommonResult;
  }

  /**
   * Get all UTXOs for the tracked address
   * @returns Array of UTXOs
   */
  async getAllUtxos(): Promise<any[]> {
    try {
      // // Use Blockstream API for testnet
      // const apiUrl = this.bitcoinNetwork === 'testnet' 
      //   ? 'https://blockstream.info/testnet/api'
      //   : 'https://blockstream.info/api';

              // Use Blockstream API for testnet
      const apiUrl = this.bitcoinNetwork === 'testnet' 
      ? 'https://mempool.space/testnet/api'
      : 'https://blockstream.info/api';
      
      // Fetch UTXOs for the tracked address
      console.log(`${apiUrl}/address/${this.trackedAddress}/utxo`);
      const response = await axios.get(`${apiUrl}/address/${this.trackedAddress}/utxo`);
      if (!response.data || response.data.length === 0) {
          throw new Error("No UTXOs available");
      }
      return response.data;
    } catch (error) {
      console.error('Error getting UTXOs:', error);
      throw error;
    }
  }

  /**
   * Fetch raw transaction hex for a given txid
   * @param txid - Transaction ID
   * @returns Raw transaction hex
   */
  async fetchRawTx(txid: string): Promise<string> {
    if (this.clients.size === 0) {
      await this.initializeConnections();
    }

    const client = Array.from(this.clients.values())[0];
    const rawTx = await (client as any).getRawTransaction(txid);
    return rawTx;
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
        if (this.bitcoinNetwork === 'testnet') {
          return Math.min(feeRate, 5)
        }
        
        return feeRate;
      }
    } catch (error) {
      console.error('Error getting network fee rate:', error);
    }
    
    // Fallback to a conservative fee rate if we can't get it from the node
    return this.bitcoinNetwork === 'testnet' ? 2 : 5; // 2 satoshis per byte for testnet, 5 for mainnet
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

  /**
   * Generate and sign a Bitcoin transaction
   * @param destinationAddress - Destination Bitcoin address
   * @param amountSat - Amount to send in satoshis
   * @param contract - Smart contract instance for signing
   * @returns Object containing raw transaction hex and transaction hash
   */
  async generateAndSignTransaction(
    destinationAddress: string,
    amountSat: number | bigint,
    sapphireConnection: SapphireConnection
  ): Promise<{ rawTxHex: string; txHash: string }> {
    const network = this.network;
    const psbt = new bitcoin.Psbt({ network });

    // Get UTXOs
    const utxos = await this.getAllUtxos();
    if (utxos.length === 0) {
      throw new Error("No UTXOs available");
    }

    // Calculate total balance
    const totalBalance = utxos.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n);

    console.log(`Total balance: ${totalBalance} satoshis`);
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
      rBuf = this.toPositiveBuffer(rBuf);
      sBuf = this.toPositiveBuffer(sBuf);
      
      const derSig = Buffer.concat([
        this.encodeDerSignature(new BN(rBuf), new BN(sBuf)),
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
    if (this.clients.size === 0) {
      await this.initializeConnections();
    }

    const client = Array.from(this.clients.values())[0];
    const txid = await (client as any).sendRawTransaction(rawTxHex);
    return txid;
  }

  /**
   * Helper function to encode DER signature
   */
  private encodeDerSignature(r: any, s: any): Buffer {
    const rBuf = this.toPositiveBuffer(r.toArrayLike(Buffer, 'be'));
    const sBuf = this.toPositiveBuffer(s.toArrayLike(Buffer, 'be'));
    return Buffer.from(bip66.encode(rBuf, sBuf));
  }

  /**
   * Helper function to ensure buffer is positive
   */
  private toPositiveBuffer(buf: Buffer): Buffer {
    if (buf[0] & 0x80) {
      return Buffer.concat([Buffer.from([0x00]), buf]);
    }
    return buf;
  }
} 