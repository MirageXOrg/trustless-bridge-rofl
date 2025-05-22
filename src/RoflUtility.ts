import axios, { AxiosInstance } from 'axios';

export interface TxParams {
  gas: string;
  to: string;
  value: string;
  data: string;
}

export class RoflUtility {
  private static readonly ROFL_SOCKET_PATH = '/run/rofl-appd.sock';
  private url: string;
  private client: AxiosInstance;

  constructor(url: string = '') {
    this.url = url;

    if (this.url && !this.url.startsWith('http')) {
      // UDS passed explicitly
      this.client = axios.create({
        baseURL: 'http://localhost',
        socketPath: this.url,
      });
      console.log(`Using HTTP socket: ${this.url}`);
    } else if (!this.url) {
      // Use default UDS
      this.client = axios.create({
        baseURL: 'http://localhost',
        socketPath: RoflUtility.ROFL_SOCKET_PATH,
      });
      console.log(`Using unix domain socket: ${RoflUtility.ROFL_SOCKET_PATH}`);
    } else {
      // Use HTTP URL
      this.client = axios.create({
        baseURL: this.url,
      });
    }
  }

  private async _appdPost(path: string, payload: any): Promise<any> {
    const url = this.url && this.url.startsWith('http') ? this.url : 'http://localhost';
    console.log(`Posting ${JSON.stringify(payload)} to ${url + path}`);

    try {
      const response = await this.client.post(path, payload, { timeout: 0 });
      return response.data;
    } catch (err: any) {
      console.error('Error in _appdPost:', err.response?.data || err.message);
      throw err;
    }
  }

  async fetchKey(id: string): Promise<string> {
    const payload = {
      key_id: id,
      kind: 'secp256k1',
    };

    const path = '/rofl/v1/keys/generate';
    const response = await this._appdPost(path, payload);
    return response.key;
  }

  async submitTx(tx: TxParams): Promise<string> {
    const payload = {
      tx: {
        kind: 'eth',
        data: {
          gas_limit: Number(tx.gas),
          to: tx.to.replace(/^0x/, ''),
          value: Number(tx.value),
          data: tx.data.replace(/^0x/, ''),
        },
      },
      encrypted: false,
    };

    const path = '/rofl/v1/tx/sign-submit';
    const response = await this._appdPost(path, payload);
    return response.data;
  }
}