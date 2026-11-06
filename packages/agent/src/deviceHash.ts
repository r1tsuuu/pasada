import { createHash } from 'node:crypto';

/**
 * Noir's convention: SHA-256 over the UTF-8 bytes of the tag UID string, as lowercase hex.
 * UIDs here are uppercase hex with no separators (e.g. "04A1B2C3D4E501").
 */
export function normalizeUid(uid: string): string {
  return uid.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
}

export function deviceHashFromUid(uid: string): string {
  return createHash('sha256').update(normalizeUid(uid), 'utf8').digest('hex');
}
