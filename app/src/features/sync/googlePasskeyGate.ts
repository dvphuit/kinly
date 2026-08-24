import { getLocalRecord, removeLocalRecord, setLocalRecord } from '@/data/localDb';

const GOOGLE_PASSKEY_GATE_KEY = 'babygrowth_v4_google_passkey_gate';
const GATE_VERSION = 1;
const CHALLENGE_BYTES = 32;

export type GooglePasskeyGateErrorCode =
  | 'unsupported'
  | 'already-exists'
  | 'not-found'
  | 'rp-mismatch'
  | 'cancelled'
  | 'invalid-credential';

export class GooglePasskeyGateError extends Error {
  readonly code: GooglePasskeyGateErrorCode;

  constructor(code: GooglePasskeyGateErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GooglePasskeyGateError';
    this.code = code;
  }
}

interface StoredGooglePasskeyGateV1 {
  version: 1;
  credentialId: string;
  rpId: string;
  createdAt: string;
}

function randomBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(CHALLENGE_BYTES));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new GooglePasskeyGateError('invalid-credential', 'Passkey đã lưu có định dạng không hợp lệ.');
  }
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function currentRpId(): string {
  const rpId = window.location.hostname;
  if (!rpId) throw new GooglePasskeyGateError('unsupported', 'Không xác định được miền Passkey của Kinly.');
  return rpId;
}

function assertWebAuthnAvailable(): void {
  if (typeof window === 'undefined' || window.isSecureContext !== true) {
    throw new GooglePasskeyGateError('unsupported', 'Passkey chỉ hoạt động khi Kinly chạy qua HTTPS.');
  }
  if (typeof navigator === 'undefined' || !navigator.credentials || typeof PublicKeyCredential === 'undefined') {
    throw new GooglePasskeyGateError('unsupported', 'Thiết bị hoặc trình duyệt chưa hỗ trợ Passkey.');
  }
}

function parseStoredGate(raw: string | null): StoredGooglePasskeyGateV1 | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Partial<StoredGooglePasskeyGateV1>;
    if (
      record.version !== GATE_VERSION
      || typeof record.credentialId !== 'string'
      || !record.credentialId
      || typeof record.rpId !== 'string'
      || !record.rpId
      || typeof record.createdAt !== 'string'
      || !record.createdAt
    ) return null;
    return record as StoredGooglePasskeyGateV1;
  } catch {
    return null;
  }
}

function credentialIdFromResult(credential: Credential | null): string | null {
  if (!credential || credential.type !== 'public-key' || !('rawId' in credential)) return null;
  const rawId = (credential as PublicKeyCredential).rawId;
  return rawId instanceof ArrayBuffer ? bytesToBase64Url(new Uint8Array(rawId)) : null;
}

export async function isGooglePasskeyGateSupported(): Promise<boolean> {
  try {
    assertWebAuthnAvailable();
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function hasGooglePasskeyGate(): Promise<boolean> {
  return parseStoredGate(await getLocalRecord(GOOGLE_PASSKEY_GATE_KEY)) !== null;
}

export async function createGooglePasskeyGate(): Promise<void> {
  assertWebAuthnAvailable();
  if (!(await isGooglePasskeyGateSupported())) {
    throw new GooglePasskeyGateError('unsupported', 'Thiết bị chưa có bộ xác thực Passkey phù hợp.');
  }
  if (await hasGooglePasskeyGate()) {
    throw new GooglePasskeyGateError('already-exists', 'Passkey cho Google Drive đã được thiết lập trên thiết bị này.');
  }

  const rpId = currentRpId();
  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: toArrayBuffer(randomBytes()),
    rp: { id: rpId, name: 'Kinly' },
    user: {
      id: toArrayBuffer(randomBytes()),
      name: 'kinly-google-drive',
      displayName: 'Kinly Google Drive',
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
    timeout: 60_000,
    attestation: 'none',
  };

  let credential: Credential | null;
  try {
    credential = await navigator.credentials.create({ publicKey });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new GooglePasskeyGateError('cancelled', 'Đã hủy thiết lập Passkey.', { cause: error });
    }
    throw error;
  }

  const credentialId = credentialIdFromResult(credential);
  if (!credentialId) {
    throw new GooglePasskeyGateError('invalid-credential', 'Không nhận được Passkey hợp lệ từ thiết bị.');
  }

  const record: StoredGooglePasskeyGateV1 = {
    version: GATE_VERSION,
    credentialId,
    rpId,
    createdAt: new Date().toISOString(),
  };
  await setLocalRecord(GOOGLE_PASSKEY_GATE_KEY, JSON.stringify(record));
}

export async function authenticateGooglePasskeyGate(): Promise<void> {
  assertWebAuthnAvailable();
  const record = parseStoredGate(await getLocalRecord(GOOGLE_PASSKEY_GATE_KEY));
  if (!record) throw new GooglePasskeyGateError('not-found', 'Chưa thiết lập Passkey cho Google Drive.');
  if (record.rpId !== currentRpId()) {
    throw new GooglePasskeyGateError('rp-mismatch', 'Passkey này thuộc một miền Kinly khác.');
  }

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: toArrayBuffer(randomBytes()),
    rpId: record.rpId,
    allowCredentials: [{
      type: 'public-key',
      id: toArrayBuffer(base64UrlToBytes(record.credentialId)),
    }],
    userVerification: 'required',
    timeout: 60_000,
  };

  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get({ publicKey });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new GooglePasskeyGateError('cancelled', 'Đã hủy xác thực Passkey.', { cause: error });
    }
    throw error;
  }

  if (credentialIdFromResult(credential) !== record.credentialId) {
    throw new GooglePasskeyGateError('invalid-credential', 'Passkey xác thực không khớp với thiết bị đã thiết lập.');
  }
}

export async function clearGooglePasskeyGate(): Promise<void> {
  await removeLocalRecord(GOOGLE_PASSKEY_GATE_KEY);
}
