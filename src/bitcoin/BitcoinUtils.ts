import * as bitcoin from 'bitcoinjs-lib';
import * as bitcoinMessage from 'bitcoinjs-message';
import * as bip66 from 'bip66';

/**
 * Helper function to encode DER signature
 */
export function encodeDerSignature(r: any, s: any): Buffer {
  const rBuf = toPositiveBuffer(r.toArrayLike(Buffer, 'be'));
  const sBuf = toPositiveBuffer(s.toArrayLike(Buffer, 'be'));
  return Buffer.from(bip66.encode(rBuf, sBuf));
}

/**
 * Helper function to ensure buffer is positive
 */
export function toPositiveBuffer(buf: Buffer): Buffer {
  if (buf[0] & 0x80) {
    return Buffer.concat([Buffer.from([0x00]), buf]);
  }
  return buf;
}

/**
 * Verify a Bitcoin signature against a transaction
 * @param message - The message that was signed
 * @param signature - Signature to verify
 * @param signerAddress - Bitcoin address of the signer (from transaction)
 * @param network - Bitcoin network to use
 * @returns Whether the signature is valid and matches the transaction sender
 */
export function verifySignature(
  message: string, 
  signature: string, 
  signerAddress: string,
  network: bitcoin.networks.Network
): boolean {
  try {
    // Verify the signature directly using bitcoinjs-message
    // For Electrum segwit signatures, we need to pass checkSegwitAlways=true
    const isValid = bitcoinMessage.verify(
      message, 
      signerAddress, 
      signature, 
      network.messagePrefix, 
      true
    );
    
    return isValid;
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
} 