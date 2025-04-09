import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import ECPair from 'ecpair';

/**
 * Interface for Bitcoin transaction information
 */
export interface BitcoinTransactionInfo {
  txHash: string;
  amount: number; // Amount in satoshis (1 BTC = 100,000,000 satoshis)
  sender: string | null; // Can be null if the sender address can't be extracted
  receiver: string | null; // Can be null if the tracked address is not a receiver
  confirmations: number;
  provider: string;
}

/**
 * Class for handling Bitcoin network connections and operations
 */
export class BitcoinConnection {
  private bitcoinNetwork: string;
  private bitcoinRpcProviders: string[] = [
    'https://btc.getblock.io/mainnet/',
    'https://mainnet.bitcoin.com/api/',
    'https://api.blockcypher.com/v1/btc/main/',
    'https://api.blockchair.com/bitcoin/',
    'https://api.bitaps.com/btc/v1/blockchain/'
  ];
  private network: bitcoin.networks.Network;
  private trackedAddress: string;

  /**
   * Constructor for BitcoinConnection
   * @param bitcoinNetwork - Bitcoin network to connect to (mainnet, testnet)
   * @param trackedAddress - Bitcoin address to track for incoming transactions
   */
  constructor(bitcoinNetwork: string, trackedAddress: string) {
    this.bitcoinNetwork = bitcoinNetwork;
    this.trackedAddress = trackedAddress;
    
    // Set Bitcoin network
    this.network = this.bitcoinNetwork === 'testnet' 
      ? bitcoin.networks.testnet 
      : bitcoin.networks.bitcoin;
    
    // Set Bitcoin RPC providers based on network
    if (this.bitcoinNetwork === 'testnet') {
      this.bitcoinRpcProviders = [
        'https://bitcoin-testnet-rpc.publicnode.com/',
         //'https://bitcoin-testnet.public.blastapi.io/',
      ];
    }
  }

  /**
   * Fetch Bitcoin transaction information from multiple RPC providers
   * @param txHash - Bitcoin transaction hash
   * @returns Bitcoin transaction information
   */
  async fetchTransactionInfo(txHash: string): Promise<BitcoinTransactionInfo> {
    console.log(`Fetching Bitcoin transaction info for ${txHash} from multiple providers...`);
    
    // Fetch transaction info from all providers in parallel
    const providerPromises = this.bitcoinRpcProviders.map(provider => 
      this.fetchFromProvider(provider, txHash)
    );
    
    // Wait for all providers to respond
    const results = await Promise.allSettled(providerPromises);
    
    // Filter out failed requests and null results
    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<BitcoinTransactionInfo | null> => 
        result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value as BitcoinTransactionInfo);
    
    if (successfulResults.length === 0) {
      throw new Error(`Failed to fetch transaction info from any provider for ${txHash}`);
    }
    
    // Check if all providers returned the same information
    const isConsistent = this.areResultsConsistent(successfulResults);
    
    if (!isConsistent) {
      console.warn(`Inconsistent transaction information received for ${txHash}`);
      console.warn('Results:', successfulResults);
    }
    
    // Return the most common result (or the first one if all are different)
    return this.getMostCommonResult(successfulResults);
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
   * Fetch transaction information from a specific provider
   * @param provider - RPC provider URL
   * @param txHash - Bitcoin transaction hash
   * @returns Bitcoin transaction information
   */
  private async fetchFromProvider(provider: string, txHash: string): Promise<BitcoinTransactionInfo | null> {
    try {
      console.log(`Fetching from provider: ${provider}`);
      
      const response = await axios.post(provider, {
        jsonrpc: '1.0',
        id: 'fetchTx',
        method: 'getrawtransaction',
        params: [txHash, true],
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
  
      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      const tx = response.data.result;
      
      // Extract transaction information
      const { amount, receiver } = this.calculateAmountForTrackedAddress(tx);
      const sender = this.extractSender(tx);
      const confirmations = tx.confirmations || 0;
      
      return {
        txHash,
        amount,
        sender,
        receiver,
        confirmations,
        provider: new URL(provider).hostname
      };
    } catch (error) {
      console.error(`RPC Error from ${provider}:`, error);
      return null;
    }
  }

  /**
   * Calculate the amount received by the tracked address from a transaction
   * @param tx - Transaction data
   * @returns Object containing amount in satoshis and receiver address (or null if tracked address is not a receiver)
   */
  private calculateAmountForTrackedAddress(tx: any): { amount: number, receiver: string | null } {
    try {
      if (tx && tx.vout && tx.vout.length > 0) {
        let totalAmount = 0;
        let isTrackedAddressReceiver = false;
        
        // Check each output to see if it's sent to the tracked address
        for (const output of tx.vout) {
          // Get the receiver address for this output
          const outputReceiver = this.extractReceiverForOutput(output);
          
          // If this output is sent to the tracked address, add its value to the total
          if (outputReceiver === this.trackedAddress) {
            // Convert BTC to satoshis (1 BTC = 100,000,000 satoshis)
            const valueInSatoshis = Math.round(parseFloat(output.value) * 100000000);
            totalAmount += valueInSatoshis;
            isTrackedAddressReceiver = true;
          }
        }
        
        // If the tracked address is a receiver, return the amount and the address
        // Otherwise, return 0 and null
        return {
          amount: isTrackedAddressReceiver ? totalAmount : 0,
          receiver: isTrackedAddressReceiver ? this.trackedAddress : null
        };
      }
      return { amount: 0, receiver: null };
    } catch (error) {
      console.error('Error calculating amount for tracked address:', error);
      return { amount: 0, receiver: null };
    }
  }

  /**
   * Extract the receiver from a specific output
   * @param output - Transaction output
   * @returns Receiver address or null if it can't be extracted
   */
  private extractReceiverForOutput(output: any): string | null {
    try {
      // First try to get the address directly if available
      if (output.address) {
        return output.address;
      }
      
      // If address is not directly available, try to extract it from the script
      if (output.scriptPubKey) {
        // Try to get address directly from scriptPubKey
        if (output.scriptPubKey.address) {
          return output.scriptPubKey.address;
        }
        
        // Try to get address from addresses array if available
        if (output.scriptPubKey.addresses && output.scriptPubKey.addresses.length > 0) {
          return output.scriptPubKey.addresses[0];
        }
        
        // Try to extract from asm if available
        if (output.scriptPubKey.asm) {
          const scriptParts = output.scriptPubKey.asm.split(' ');
          if (scriptParts.length > 2 && scriptParts[0] === 'OP_DUP' && scriptParts[1] === 'OP_HASH160') {
            // The address hash is usually the third part of the script
            const addressHash = scriptParts[2];
            if (addressHash && addressHash.length > 0) {
              try {
                // Derive the address from the hash
                const { address } = bitcoin.payments.p2pkh({ 
                  hash: Buffer.from(addressHash, 'hex'),
                  network: this.network
                });
                
                if (address) {
                  return address;
                }
              } catch (e) {
                console.error('Error processing address hash:', e);
              }
            }
          }
        }
        
        // Try to get the hex property and decode it
        if (output.scriptPubKey.hex) {
          try {
            const scriptBuffer = Buffer.from(output.scriptPubKey.hex, 'hex');
            const script = bitcoin.script.decompile(scriptBuffer);
            
            if (script && script.length > 2) {
              // For P2PKH, the pattern is: OP_DUP, OP_HASH160, <pubKeyHash>, OP_EQUALVERIFY, OP_CHECKSIG
              if (script[0] === bitcoin.opcodes.OP_DUP && 
                  script[1] === bitcoin.opcodes.OP_HASH160 && 
                  Buffer.isBuffer(script[2])) {
                
                // Derive the address from the hash
                const { address } = bitcoin.payments.p2pkh({ 
                  hash: script[2],
                  network: this.network
                });
                
                if (address) {
                  return address;
                }
              }
            }
          } catch (e) {
            console.error('Error processing script hex:', e);
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error extracting receiver for output:', error);
      return null;
    }
  }

  /**
   * Calculate the amount from a transaction
   * @param tx - Transaction data
   * @returns Amount in satoshis
   */
  private calculateAmount(tx: any): number {
    try {
      if (tx && tx.vout && tx.vout.length > 0) {
        // Sum up all output values
        const totalOutput = tx.vout.reduce((sum: number, output: any) => {
          // Convert BTC to satoshis (1 BTC = 100,000,000 satoshis)
          const valueInSatoshis = Math.round(parseFloat(output.value) * 100000000);
          return sum + valueInSatoshis;
        }, 0);
        
        return totalOutput;
      }
      return 0;
    } catch (error) {
      console.error('Error calculating amount:', error);
      return 0;
    }
  }

  /**
   * Calculate the amount from a Blockcypher transaction
   * @param tx - Transaction data from Blockcypher
   * @returns Amount in satoshis
   */
  private calculateAmountFromBlockcypher(tx: any): number {
    if (tx && tx.outputs && tx.outputs.length > 0) {
      // Blockcypher returns values in satoshis
      return tx.outputs.reduce((sum: number, output: any) => sum + (output.value || 0), 0);
    }
    return 0;
  }

  /**
   * Extract the sender from a transaction
   * @param tx - Transaction data
   * @returns Sender address or null if it can't be extracted
   */
  private extractSender(tx: any): string | null {
    try {
      if (tx && tx.vin && tx.vin.length > 0) {
        // For each input, try to extract the address
        for (const input of tx.vin) {
          // First try to get the address directly if available
          if (input.address) {
            return input.address;
          }
          
          // Check for SegWit transaction (witness data)
          if (input.txinwitness && input.txinwitness.length > 0) {
            // In SegWit transactions, the public key is usually the second element in the witness array
            if (input.txinwitness.length > 1) {
              const pubKeyHex = input.txinwitness[1];
              if (pubKeyHex && pubKeyHex.length > 0) {
                try {
                  const pubKeyBuffer = Buffer.from(pubKeyHex, 'hex');
                  
                  // Derive the address from the public key
                  const { address } = bitcoin.payments.p2wpkh({ 
                    pubkey: pubKeyBuffer,
                    network: this.network
                  });
                  
                  if (address) {
                    return address;
                  }
                } catch (e) {
                  console.error('Error processing witness public key:', e);
                }
              }
            }
          }
          
          // If address is not directly available, try to extract it from the script
          if (input.scriptSig) {
            // Log the scriptSig object to see its structure
            console.log('scriptSig:', JSON.stringify(input.scriptSig));
            
            // Try to get the asm property
            if (input.scriptSig.asm) {
              const scriptParts = input.scriptSig.asm.split(' ');
              if (scriptParts.length > 1) {
                // The public key is usually the second part of the script
                const pubKeyHex = scriptParts[1];
                if (pubKeyHex && pubKeyHex.length > 0) {
                  try {
                    const pubKeyBuffer = Buffer.from(pubKeyHex, 'hex');
                    
                    // Derive the address from the public key
                    const { address } = bitcoin.payments.p2pkh({ 
                      pubkey: pubKeyBuffer,
                      network: this.network
                    });
                    
                    if (address) {
                      return address;
                    }
                  } catch (e) {
                    console.error('Error processing public key:', e);
                  }
                }
              }
            }
            
            // Try to get the hex property and decode it
            if (input.scriptSig.hex) {
              try {
                const scriptBuffer = Buffer.from(input.scriptSig.hex, 'hex');
                const script = bitcoin.script.decompile(scriptBuffer);
                
                if (script && script.length > 1) {
                  const pubKeyBuffer = script[1];
                  if (Buffer.isBuffer(pubKeyBuffer)) {
                    // Derive the address from the public key
                    const { address } = bitcoin.payments.p2pkh({ 
                      pubkey: pubKeyBuffer,
                      network: this.network
                    });
                    
                    if (address) {
                      return address;
                    }
                  }
                }
              } catch (e) {
                console.error('Error processing script hex:', e);
              }
            }
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error extracting sender:', error);
      return null;
    }
  }

  /**
   * Extract the sender from a Blockcypher transaction
   * @param tx - Transaction data from Blockcypher
   * @returns Sender address or null if it can't be extracted
   */
  private extractSenderFromBlockcypher(tx: any): string | null {
    if (tx && tx.inputs && tx.inputs.length > 0) {
      return tx.inputs[0].addresses[0] || null;
    }
    return null;
  }

  /**
   * Extract the receiver from a transaction
   * @param tx - Transaction data
   * @returns Receiver address or null if it can't be extracted
   */
  private extractReceiver(tx: any): string | null {
    try {
      if (tx && tx.vout && tx.vout.length > 0) {
        // For each output, try to extract the address
        for (const output of tx.vout) {
          // First try to get the address directly if available
          if (output.address) {
            return output.address;
          }
          
          // If address is not directly available, try to extract it from the script
          if (output.scriptPubKey) {
            
            // Try to get address directly from scriptPubKey
            if (output.scriptPubKey.address) {
              return output.scriptPubKey.address;
            }
            
            // Try to get address from addresses array if available
            if (output.scriptPubKey.addresses && output.scriptPubKey.addresses.length > 0) {
              return output.scriptPubKey.addresses[0];
            }
            
            // Try to extract from asm if available
            if (output.scriptPubKey.asm) {
              const scriptParts = output.scriptPubKey.asm.split(' ');
              if (scriptParts.length > 2 && scriptParts[0] === 'OP_DUP' && scriptParts[1] === 'OP_HASH160') {
                // The address hash is usually the third part of the script
                const addressHash = scriptParts[2];
                if (addressHash && addressHash.length > 0) {
                  try {
                    // Derive the address from the hash
                    const { address } = bitcoin.payments.p2pkh({ 
                      hash: Buffer.from(addressHash, 'hex'),
                      network: this.network
                    });
                    
                    if (address) {
                      return address;
                    }
                  } catch (e) {
                    console.error('Error processing address hash:', e);
                  }
                }
              }
            }
            
            // Try to get the hex property and decode it
            if (output.scriptPubKey.hex) {
              try {
                const scriptBuffer = Buffer.from(output.scriptPubKey.hex, 'hex');
                const script = bitcoin.script.decompile(scriptBuffer);
                
                if (script && script.length > 2) {
                  // For P2PKH, the pattern is: OP_DUP, OP_HASH160, <pubKeyHash>, OP_EQUALVERIFY, OP_CHECKSIG
                  if (script[0] === bitcoin.opcodes.OP_DUP && 
                      script[1] === bitcoin.opcodes.OP_HASH160 && 
                      Buffer.isBuffer(script[2])) {
                    
                    // Derive the address from the hash
                    const { address } = bitcoin.payments.p2pkh({ 
                      hash: script[2],
                      network: this.network
                    });
                    
                    if (address) {
                      return address;
                    }
                  }
                }
              } catch (e) {
                console.error('Error processing script hex:', e);
              }
            }
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error extracting receiver:', error);
      return null;
    }
  }

  /**
   * Extract the receiver from a Blockcypher transaction
   * @param tx - Transaction data from Blockcypher
   * @returns Receiver address or null if it can't be extracted
   */
  private extractReceiverFromBlockcypher(tx: any): string | null {
    if (tx && tx.outputs && tx.outputs.length > 0) {
      return tx.outputs[0].addresses[0] || null;
    }
    return null;
  }

  /**
   * Check if all results are consistent
   * @param results - Array of transaction information from different providers
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
   * @param results - Array of transaction information from different providers
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