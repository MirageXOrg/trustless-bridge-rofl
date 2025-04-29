import { TxParams } from './types';

/**
 * Utility class for interacting with ROFL services
 */
export class RoflUtility {
  private readonly ROFL_SOCKET_PATH = '/run/rofl-appd.sock';
  private url: string;

  /**
   * Constructor for RoflUtility
   * @param url - URL for the KMS service
   */
  constructor(url: string = '') {
    this.url = url;
    
    if (this.url && !this.url.startsWith('http')) {
      console.log(`[Rofl] Using HTTP socket: ${this.url}`);
    } else if (!this.url) {
      console.log(`[Rofl] Using unix domain socket: ${this.ROFL_SOCKET_PATH}`);
    } else {
      console.log(`[Rofl] Using HTTP URL: ${this.url}`);
    }
  }

  /**
   * Make a POST request to the appd service
   * @param path - API path
   * @param payload - Request payload
   * @returns Response data
   */
  private async appdPost(path: string, payload: any): Promise<any> {
    const baseUrl = this.url && this.url.startsWith('http') ? this.url : 'http://localhost';
    const fullUrl = `${baseUrl}${path}`;
    
    console.log(`[Rofl] Sending request to: ${fullUrl}`);
    
    try {
      // In a real implementation, we would need to handle Unix domain sockets
      // For now, we'll just use HTTP
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error making POST request:', error);
      throw error;
    }
  }

  /**
   * Fetch a key from the KMS service
   * @param keyId - ID of the key to fetch
   * @returns The secret key
   */
  async fetchKey(keyId: string): Promise<string> {
    const payload = {
      key_id: keyId,
      kind: 'secp256k1'
    };
    
    const path = '/rofl/v1/keys/generate';
    const response = await this.appdPost(path, payload);
    
    return response.key;
  }

  /**
   * Submit a transaction to the blockchain
   * @param tx - Transaction parameters
   * @returns Transaction hash
   */
  async submitTx(tx: TxParams): Promise<string> {
    const payload = {
      tx: {
        kind: 'eth',
        data: {
          gas_limit: tx.gas,
          to: tx.to.startsWith('0x') ? tx.to.substring(2) : tx.to,
          value: tx.value,
          data: tx.data.startsWith('0x') ? tx.data.substring(2) : tx.data,
        },
      },
      encrypted: false,
    };
    
    const path = '/rofl/v1/tx/sign-submit';
    return this.appdPost(path, payload);
  }
} 