import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authenticateGooglePasskeyGate,
  createGooglePasskeyGate,
  hasGooglePasskeyGate,
  isGooglePasskeyGateSupported,
} from './googlePasskeyGate';

const storage = vi.hoisted(() => new Map<string, string>());
const localDb = vi.hoisted(() => ({
  getLocalRecord: vi.fn(async (key: string) => storage.get(key) ?? null),
  setLocalRecord: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
  removeLocalRecord: vi.fn(async (key: string) => { storage.delete(key); }),
}));

vi.mock('@/data/localDb', () => localDb);

const createCredential = vi.fn();
const getCredential = vi.fn();
const credentialBytes = Uint8Array.from([1, 2, 3, 4]);

function publicKeyCredential(bytes = credentialBytes): Credential {
  return {
    type: 'public-key',
    rawId: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Credential;
}

describe('Google Passkey gate', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: { create: createCredential, get: getCredential },
    });
    vi.stubGlobal('PublicKeyCredential', class {
      static isUserVerifyingPlatformAuthenticatorAvailable = vi.fn().mockResolvedValue(true);
    });
    createCredential.mockResolvedValue(publicKeyCredential());
    getCredential.mockResolvedValue(publicKeyCredential());
  });

  it('creates a device-local gate without persisting Google tokens', async () => {
    await expect(isGooglePasskeyGateSupported()).resolves.toBe(true);
    await createGooglePasskeyGate();

    expect(createCredential).toHaveBeenCalledTimes(1);
    await expect(hasGooglePasskeyGate()).resolves.toBe(true);
    const stored = [...storage.values()][0];
    expect(stored).toContain('credentialId');
    expect(stored).not.toContain('access_token');
    expect(stored).not.toContain('refresh_token');
  });

  it('requires the configured credential with user verification', async () => {
    await createGooglePasskeyGate();
    await authenticateGooglePasskeyGate();

    expect(getCredential).toHaveBeenCalledTimes(1);
    const options = getCredential.mock.calls[0]?.[0] as CredentialRequestOptions;
    expect(options.publicKey?.userVerification).toBe('required');
    expect(options.publicKey?.allowCredentials).toHaveLength(1);
  });

  it('rejects an assertion from a different credential', async () => {
    await createGooglePasskeyGate();
    getCredential.mockResolvedValue(publicKeyCredential(Uint8Array.from([9, 9, 9])));

    await expect(authenticateGooglePasskeyGate()).rejects.toMatchObject({ code: 'invalid-credential' });
  });
});
