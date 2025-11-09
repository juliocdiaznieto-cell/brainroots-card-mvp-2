// src/utils/license.ts
import { Store } from '@tauri-apps/api/store';

// We'll use a simple file-based store to persist the license status.
const store = new Store('license.dat');

export type LicenseStatus = 'unlicensed' | 'licensed';

/**
 * Retrieves the current license status from persistent storage.
 * @returns {Promise<LicenseStatus>} The current status, defaulting to "unlicensed".
 */
export async function getLicenseStatus(): Promise<LicenseStatus> {
  const status = await store.get<LicenseStatus>('status');
  return status || 'unlicensed';
}

/**
 * Saves the license status to persistent storage.
 * @param {LicenseStatus} status - The new status to save.
 */
export async function setLicenseStatus(status: LicenseStatus): Promise<void> {
  await store.set('status', status);
  await store.save(); // Explicitly save the store to disk
}

/**
 * Saves the user's license key to persistent storage.
 * @param {string} key - The license key to save.
 */
export async function saveLicenseKey(key: string): Promise<void> {
  await store.set('licenseKey', key);
  await store.save();
}

/**
 * Retrieves the saved license key from persistent storage.
 * @returns {Promise<string | null>} The saved key, or null if not found.
 */
export async function getLicenseKey(): Promise<string | null> {
  return store.get<string>('licenseKey');
}

/**
 * Verifies a license key using the public key from the backend.
 * @param {string} licenseKey - The license key to verify.
 * @returns {Promise<boolean>} True if the key is valid, false otherwise.
 */
export async function verifyLicenseKey(licenseKey: string): Promise<boolean> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const publicKeyPem = await invoke<string>('get_public_key');

    const publicKey = await crypto.subtle.importKey(
      'spki',
      pemToArrayBuffer(publicKeyPem),
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['verify']
    );

    const signature = Uint8Array.from(atob(licenseKey), c => c.charCodeAt(0));
    const data = new TextEncoder().encode('VALID_LICENSE');

    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      publicKey,
      signature,
      data
    );
  } catch (error) {
    console.error('Error verifying license key:', error);
    return false;
  }
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
