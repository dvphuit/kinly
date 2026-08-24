import crypto from 'node:crypto';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const CURRENT_VERSION = 'v2';

type SecretProvider = { value(): string };

function decodeConfiguredKey(secret: SecretProvider): Buffer {
  const configured = secret.value().trim();
  if (/^[0-9a-fA-F]{64}$/.test(configured)) {
    return Buffer.from(configured, 'hex');
  }

  if (/^[A-Za-z0-9+/]+={0,2}$/.test(configured) && configured.length % 4 === 0) {
    const decoded = Buffer.from(configured, 'base64');
    if (decoded.length === KEY_BYTES && decoded.toString('base64') === configured) return decoded;
  }

  throw new Error('TOKEN_ENCRYPTION_KEY must be exactly 32 bytes as 64 hex characters or standard base64.');
}

function assertAad(aad: string): void {
  if (!aad || aad.length > 256) throw new Error('Encryption context is required and must be <= 256 characters.');
}

export function encryptSecret(value: string, secret: SecretProvider, aad: string): string {
  assertAad(aad);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', decodeConfiguredKey(secret), iv, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${CURRENT_VERSION}:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(value: string, secret: SecretProvider, aad: string): string {
  const [version, ivEncoded, tagEncoded, encryptedEncoded] = value.split(':');
  if (!version || !ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error('Invalid encrypted secret format.');

  const iv = Buffer.from(ivEncoded, 'base64url');
  const tag = Buffer.from(tagEncoded, 'base64url');
  const encrypted = Buffer.from(encryptedEncoded, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) throw new Error('Invalid encrypted secret parameters.');

  const decipher = crypto.createDecipheriv('aes-256-gcm', decodeConfiguredKey(secret), iv, { authTagLength: AUTH_TAG_BYTES });
  if (version === CURRENT_VERSION) {
    assertAad(aad);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
  } else if (version !== 'v1') {
    throw new Error('Unsupported encrypted secret version.');
  }
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function isLegacyCiphertext(value: string): boolean {
  return value.startsWith('v1:');
}
