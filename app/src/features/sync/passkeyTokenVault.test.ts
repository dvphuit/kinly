import { webcrypto } from 'node:crypto';
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
  hasPasskeyTokenVault,
  isPasskeyTokenVaultSupported,
  PasskeyTokenVaultError,
  unlockPasskeyTokenVault,
} from './passkeyTokenVault';

const PRF_OUTPUT = new Uint8Array(32).fill(7).buffer;
const OTHER_PRF_OUTPUT = new Uint8Array(32).fill(9).buffer;
const CREDENTIAL_ID = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer;

function fakeCredential(prfOutput: ArrayBuffer) {
  return {
    id: 'credential',
    type: 'public-key',
    rawId: CREDENTIAL_ID,
    getClientExtensionResults: () => ({
      prf: {
        enabled: true,
        results: { first: prfOutput },
      },
    }),
  } as unknown as Credential;
}

function installWebAuthn(prfOutput = PRF_OUTPUT) {
  class FakePublicKeyCredential {
    static async isUserVerifyingPlatformAuthenticatorAvailable() {
      return true;
    }
  }

  vi.stubGlobal('crypto', webcrypto as unknown as Crypto);
  vi.stubGlobal('PublicKeyCredential', FakePublicKeyCredential);
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      create: vi.fn(async () => fakeCredential(prfOutput)),
      get: vi.fn(async () => fakeCredential(prfOutput)),
    },
  });
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
    const stored = [...localRecords.values()][0];
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(secret);
    expect(JSON.parse(stored!)).toMatchObject({
      version: 1,
      rpId: window.location.hostname,
    });
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
        create: vi.fn(async () => fakeCredential(PRF_OUTPUT)),
        get: vi.fn(async () => fakeCredential(OTHER_PRF_OUTPUT)),
      },
    });

    await expect(unlockPasskeyTokenVault()).rejects.toMatchObject({
      code: 'decrypt-failed',
    });
  });

  it('removes the encrypted vault record without exposing its contents', async () => {
    installWebAuthn();
    await createPasskeyTokenVault('local-only-probe');

    await clearPasskeyTokenVault();

    await expect(hasPasskeyTokenVault()).resolves.toBe(false);
  });
});
