import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { decryptSecret, encryptSecret, isLegacyCiphertext } from '../lib/security/tokenEncryption.js';

const key = { value: () => Buffer.alloc(32, 7).toString('base64') };

function createLegacyCiphertext(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.alloc(32, 7), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

test('encrypts and decrypts with AES-256-GCM and authenticated context', () => {
  const first = encryptSecret('refresh-token-value', key, 'google-account:user-a');
  const second = encryptSecret('refresh-token-value', key, 'google-account:user-a');

  assert.notEqual(first, second, 'each encryption must use a fresh nonce');
  assert.equal(decryptSecret(first, key, 'google-account:user-a'), 'refresh-token-value');
  assert.throws(() => decryptSecret(first, key, 'google-account:user-b'));
  const [version, iv, tag, ciphertext] = first.split(':');
  const tamperedTag = `${tag.startsWith('A') ? 'B' : 'A'}${tag.slice(1)}`;
  assert.throws(() => decryptSecret(`${version}:${iv}:${tamperedTag}:${ciphertext}`, key, 'google-account:user-a'));
});

test('rejects missing, invalid, and malformed encrypted secrets at the crypto boundary', () => {
  assert.throws(() => encryptSecret('value', { value: () => 'too-short' }, 'google-account:user-a'));
  assert.throws(() => decryptSecret(undefined, key, 'google-account:user-a'), /Encrypted secret is required/);
  assert.throws(() => decryptSecret('v2:bad:bad:bad', key, 'google-account:user-a'));
  assert.throws(() => encryptSecret('value', key, ''));
  assert.equal(isLegacyCiphertext(undefined), false);
});

test('decrypts legacy v1 ciphertext during migration', () => {
  const legacy = createLegacyCiphertext('legacy-refresh-token');
  assert.equal(isLegacyCiphertext(legacy), true);
  assert.equal(decryptSecret(legacy, key, 'google-account:user-a'), 'legacy-refresh-token');
});
