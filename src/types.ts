/**
 * Transaction parameters for Ethereum transactions
 */
export interface TxParams {
  /**
   * Gas limit for the transaction
   */
  gas: number | string;
  
  /**
   * Recipient address (with or without 0x prefix)
   */
  to: string;
  
  /**
   * Value to send in wei
   */
  value: number | string;
  
  /**
   * Transaction data (with or without 0x prefix)
   */
  data: string;
} 