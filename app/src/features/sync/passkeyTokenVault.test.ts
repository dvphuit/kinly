import { beforeEach, describe, expect, it, vi } from 'vitest';

const localRecords = vi.hoisted(() => new Map<string, string>());

vi.mock('@/data/localDb', () => ({
  getLocalRecord: vi.fn(async (key: string) => localRecords.get(key) ?? null),
  setLocalRecord: vi.fn(async (key: string, value: string) => { localRecords.set(key, value); }),
  removeLocalRecord: vi.fn(async (key: string) => { localRecords.delete(key); }),
}));

import {
  clearPasskeyTokenVault,
  createPasskeyTokenVault,
  hasGoogleRefreshTokenInPasskeyVault,
  hasPasskeyTokenVault,
  isPasskeyTokenVaultSupported,
  storeGoogleRefreshTokenInPasskeyVault,
  unlockGoogleRefreshTokenFromPasskeyVault,
  unlockPasskeyTokenVault,
} from './passkeyTokenVault';

const PRF_OUTPUT = new Uint8Array(32).fill(7).buffer;
const OTHER_PRF_OUTPUT = new Uint8Array(32).fill(9).buffer;
const CREDENTIAL_ID = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer;
const CREDENTIAL_ID_BASE64URL = 'AQIDBAUG';

interface FakeCryptoKey extends CryptoKey {
  marker: number;
}

function bufferBytes(source: BufferSource): Uint8Array {
  if (ArrayBuffer.isView(source)) {
    return Uint8Array.from(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
  }
  return Uint8Array.from(new Uint8Array(source));
}

function fakeCrypto(): Crypto {
  let randomSeed = 1;
  const subtle = {
    importKey: vi.fn(async (_format: KeyFormat, keyData: BufferSource) => ({
      marker: bufferBytes(keyData)[0] ?? 0,
    } as unknown as CryptoKey)),
    deriveKey: vi.fn(async (_algorithm: AlgorithmIdentifier | HkdfParams | Pbkdf2Params, baseKey: CryptoKey) => baseKey),
    encrypt: vi.fn(async (_algorithm: AlgorithmIdentifier | RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams, key: CryptoKey, data: BufferSource) => {
      const marker = (key as FakeCryptoKey).marker;
      const plaintext = bufferBytes(data);
      const ciphertext = new Uint8Array(plaintext.length + 1);
      ciphertext[0] = marker;
      for (let index = 0; index < plaintext.length; index += 1) ciphertext[index + 1] = plaintext[index] ^ marker;
      return ciphertext.buffer;
    }),
    decrypt: vi.fn(async (_algorithm: AlgorithmIdentifier | RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams, key: CryptoKey, data: BufferSource) => {
      const marker = (key as FakeCryptoKey).marker;
      const ciphertext = bufferBytes(data);
      if (ciphertext[0] !== marker) throw new DOMException('Authentication failed', 'OperationError');
      const plaintext = new Uint8Array(Math.max(0, ciphertext.length - 1));
      for (let index = 1; index < ciphertext.length; index += 1) plaintext[index - 1] = ciphertext[index] ^ marker;
      return plaintext.buffer;
    }),
  } as unknown as SubtleCrypto;

  return {
    subtle,
    getRandomValues: ((array: ArrayBufferView) => {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      bytes.fill(randomSeed);
      randomSeed = (randomSeed + 1) & 0xff;
      return array;
    }) as Crypto['getRandomValues'],
    randomUUID: () => '00000000-0000-4000-8000-000000000000',
  } as Crypto;
}

function fakeCredential(prfOutput: ArrayBuffer | null, enabled?: boolean) {
  const prf: { enabled?: boolean; results?: { first: ArrayBuffer } } = {};
  if (enabled !== undefined) prf.enabled = enabled;
  if (prfOutput) prf.results = { first: prfOutput };
  return {
    id: 'credential',
    type: 'public-key',
    rawId: CREDENTIAL_ID,
    getClientExtensionResults: () => ({ prf }),
  } as unknown as Credential;
}

function installWebAuthn(
  prfOutput = PRF_OUTPUT,
  creationPrfOutput: ArrayBuffer | null = prfOutput,
  creationPrfEnabled = true,
) {
  class FakePublicKeyCredential {
    static async isUserVerifyingPlatformAuthenticatorAvailable() {
      return true;
    }
  }

  const create = vi.fn(async () => fakeCredential(creationPrfOutput, creationPrfEnabled));
  const get = vi.fn(async () => fakeCredential(prfOutput));

  vi.stubGlobal('crypto', fakeCrypto());
  vi.stubGlobal('PublicKeyCredential', FakePublicKeyCredential);
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: { create, get },
  });

  return { create, get };
}

describe('passkeyTokenVault', () => {
  beforeEach(() => {
    localRecords.clear();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  });

  it('reports platform WebAuthn availability without creating a credential', async () => {
    installWebAuthn();

    await expect(isPasskeyTokenVaultSupported()).resolves.toBe(true);
    expect(navigator.credentials.create).not.toHaveBeenCalled();
  });

  it('stores ciphertext and metadata without persisting the plaintext secret', async () => {
    installWebAuthn();
    const secret = 'google-refresh-token-probe-value';

    await createPasskeyTokenVault(secret);

    await expect(hasPasskeyTokenVault()).resolves.toBe(true);
    await expect(hasGoogleRefreshTokenInPasskeyVault()).resolves.toBe(false);
    const stored = [...localRecords.values()][0];
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(secret);
    expect(JSON.parse(stored!)).toMatchObject({
      version: 1,
      rpId: window.location.hostname,
      purpose: 'prototype',
    });
  });

  it('falls back to PRF authentication using evalByCredential when registration has no PRF result', async () => {
    const { get } = installWebAuthn(PRF_OUTPUT, null, false);
    const secret = 'registration-without-prf-output';

    await expect(createPasskeyTokenVault(secret)).resolves.toBeUndefined();

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith({
      publicKey: expect.objectContaining({
        extensions: expect.objectContaining({
          prf: expect.objectContaining({
            evalByCredential: expect.objectContaining({
              [CREDENTIAL_ID_BASE64URL]: expect.objectContaining({
                first: expect.any(ArrayBuffer),
              }),
            }),
          }),
        }),
      }),
    });
    await expect(unlockPasskeyTokenVault()).resolves.toBe(secret);
  });

  it('upgrades an existing prototype vault to hold a real Google refresh token without creating another credential', async () => {
    const { create, get } = installWebAuthn();
    await createPasskeyTokenVault('local-only-probe');
    const refreshToken = '1//google-refresh-token';

    await storeGoogleRefreshTokenInPasskeyVault(refreshToken);

    expect(create).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    await expect(hasGoogleRefreshTokenInPasskeyVault()).resolves.toBe(true);
    const stored = [...localRecords.values()][0];
    expect(stored).not.toContain(refreshToken);
    expect(JSON.parse(stored!)).toMatchObject({ purpose: 'google-refresh-token' });
    await expect(unlockGoogleRefreshTokenFromPasskeyVault()).resolves.toBe(refreshToken);
  });

  it('creates a Google-purpose vault when no prototype exists', async () => {
    installWebAuthn();
    const refreshToken = '1//first-google-refresh-token';

    await storeGoogleRefreshTokenInPasskeyVault(refreshToken);

    await expect(hasGoogleRefreshTokenInPasskeyVault()).resolves.toBe(true);
    await expect(unlockGoogleRefreshTokenFromPasskeyVault()).resolves.toBe(refreshToken);
  });

  it('decrypts the payload only when the passkey returns the matching PRF output', async () => {
    installWebAuthn();
    const secret = 'local-only-probe';
    await createPasskeyTokenVault(secret);

    await expect(unlockPasskeyTokenVault()).resolves.toBe(secret);
  });

  it('rejects decryption when a different PRF output is returned', async () => {
    installWebAuthn();
    await createPasskeyTokenVault('local-only-probe');
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        create: vi.fn(async () => fakeCredential(PRF_OUTPUT, true)),
        get: vi.fn(async () => fakeCredential(OTHER_PRF_OUTPUT)),
      },
    });

    await expect(unlockPasskeyTokenVault()).rejects.toMatchObject({
      code: 'decrypt-failed',
    });
  });

  it('refuses to treat a prototype payload as a Google refresh token', async () => {
    installWebAuthn();
    await createPasskeyTokenVault('local-only-probe');

    await expect(unlockGoogleRefreshTokenFromPasskeyVault()).rejects.toMatchObject({
      code: 'wrong-purpose',
    });
  });

  it('removes the encrypted vault record without exposing its contents', async () => {
    installWebAuthn();
    await createPasskeyTokenVault('local-only-probe');

    await clearPasskeyTokenVault();

    await expect(hasPasskeyTokenVault()).resolves.toBe(false);
  });
});
