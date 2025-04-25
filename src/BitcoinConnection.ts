import Client = require('bitcoin-core');
import * as bitcoin from 'bitcoinjs-lib';
import ECPair from 'ecpair';
import * as bitcoinMessage from 'bitcoinjs-message';
import * as bs58 from 'bs58';

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
          url: 'https://bitcoin-testnet-rpc.publicnode.com/',
          //url: 'https://bitcoin-rpc.publicnode.com/',
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
} 