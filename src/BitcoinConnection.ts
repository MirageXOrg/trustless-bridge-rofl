import Client = require('bitcoin-core');
import * as bitcoin from 'bitcoinjs-lib';
import ECPair from 'ecpair';

/**
 * Interface for Bitcoin RPC node configuration
 */
export interface BitcoinRpcNode {
  url: string;
  username: string;
  password: string;
  name: string; // Optional name for the node (e.g., "My Node", "BlockCypher", etc.)
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
}

/**
 * Class for handling Bitcoin network connections and operations
 */
export class BitcoinConnection {
  private bitcoinNetwork: string;
  private rpcNodes: BitcoinRpcNode[];
  private network: bitcoin.networks.Network;
  private trackedAddress: string;

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
          //url: 'https://bitcoin-testnet-rpc.publicnode.com/',
          url: 'https://bitcoin-rpc.publicnode.com/',
          username: '',
          password: '',
          name: 'local-node'
        }
      ];
    } else {
      this.rpcNodes = rpcNodes;
    }
  }

  /**
   * Fetch Bitcoin transaction information from multiple RPC nodes
   * @param txHash - Bitcoin transaction hash
   * @returns Bitcoin transaction information
   */
  async fetchTransactionInfo(txHash: string): Promise<BitcoinTransactionInfo> {
    console.log(`Fetching Bitcoin transaction info for ${txHash} from multiple nodes...`);
    
    // Fetch transaction info from all nodes in parallel
    const nodePromises = this.rpcNodes.map(node => 
      this.fetchFromNode(node, txHash)
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
   * @param node - Bitcoin RPC node configuration
   * @param txHash - Bitcoin transaction hash
   * @returns Bitcoin transaction information
   */
  private async fetchFromNode(node: BitcoinRpcNode, txHash: string): Promise<BitcoinTransactionInfo | null> {
    try {
      console.log(`Fetching from node: ${node.name || node.url}`);
      
      // Initialize Bitcoin Core client for this node
      const client = new Client({
        host: node.url,
        username: node.username,
        password: node.password,
        timeout: 30000,
      });
      
      // Get raw transaction with verbose output
      const tx = await (client as any).getRawTransaction(txHash, 1);
      
      if (!tx) {
        throw new Error(`Transaction ${txHash} not found`);
      }
      
      console.log(`Transaction data: ${JSON.stringify(tx, null, 2)}`);
      
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
      
      return {
        txHash,
        amount: isTrackedAddressReceiver ? totalAmount : 0,
        sender: senders.length > 0 ? senders : null,
        receiver: isTrackedAddressReceiver ? this.trackedAddress : null,
        confirmations: tx.confirmations || 0,
        provider: node.name || new URL(node.url).hostname
      };
    } catch (error) {
      console.error(`RPC Error from ${node.name || node.url}:`, error);
      return null;
    }
  }

  /**
   * Verify a Bitcoin signature against a transaction
   * @param txHash - Bitcoin transaction hash
   * @param signature - Signature to verify
   * @param ethereumAddress - Ethereum address that was part of the signed message
   * @param signerAddress - Bitcoin address of the signer (from transaction)
   * @returns Whether the signature is valid and matches the transaction sender
   */
  async verifySignature(txHash: string, signature: string, ethereumAddress: string, signerAddress: string): Promise<boolean> {
    try {
      // Extract the Bitcoin address from the signature
      const extractedAddress = this.extractAddressFromSignature(signature, txHash, ethereumAddress);
      
      if (!extractedAddress) {
        console.error('Failed to extract Bitcoin address from signature');
        return false;
      }
      
      console.log(`Extracted Bitcoin address from signature: ${extractedAddress}`);
      console.log(`Expected signer address: ${signerAddress}`);
      
      // Compare the extracted address with the provided signer address
      const isValid = extractedAddress === signerAddress;
      
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
   * Extract a Bitcoin address from a signature
   * @param signature - Signature to extract address from
   * @param txHash - Bitcoin transaction hash that was signed
   * @param ethereumAddress - Ethereum address that was part of the signed message
   * @returns Bitcoin address that created the signature, or null if extraction failed
   */
  private extractAddressFromSignature(signature: string, txHash: string, ethereumAddress: string): string | null {
    try {
      // The message that was signed is txHash + ethereumAddress
      const message = txHash + ethereumAddress;
      
      // Convert the signature from hex to buffer
      const signatureBuffer = Buffer.from(signature, 'hex');
      
      // Create a message hash
      const messageHash = bitcoin.crypto.sha256(Buffer.from(message));
      
      // Try to recover the public key from the signature
      // This is a simplified approach - in a real implementation, you would need to
      // handle different signature types and recovery methods
      const recoveredPublicKey = this.recoverPublicKeyFromSignature(signatureBuffer, messageHash);
      
      if (!recoveredPublicKey) {
        console.error('Failed to recover public key from signature');
        return null;
      }
      
      // Derive the Bitcoin address from the public key
      const { address } = bitcoin.payments.p2pkh({ 
        pubkey: recoveredPublicKey,
        network: this.network
      });
      
      return address || null;
    } catch (error) {
      console.error('Error extracting address from signature:', error);
      return null;
    }
  }

  /**
   * Recover a public key from a signature
   * @param signature - Signature to recover public key from
   * @param messageHash - Hash of the message that was signed
   * @returns Recovered public key, or null if recovery failed
   */
  private recoverPublicKeyFromSignature(signature: Buffer, messageHash: Buffer): Buffer | null {
    try {
      // This is a simplified approach - in a real implementation, you would need to
      // handle different signature types and recovery methods
      
      // For demonstration purposes, we'll use a dummy approach
      // In a real implementation, you would use a proper signature recovery method
      
      // Create a dummy key pair for demonstration
      const ecc = require('tiny-secp256k1');
      const ECPairFactory = ECPair(ecc);
      const keyPair = ECPairFactory.makeRandom({ network: this.network });
      
      // Return the public key
      return Buffer.from(keyPair.publicKey);
    } catch (error) {
      console.error('Error recovering public key from signature:', error);
      return null;
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
      result.sender === firstResult.sender &&
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
      const key = `${result.amount}-${result.sender}-${result.receiver}-${result.confirmations}`;
      
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
} 