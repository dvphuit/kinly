import { getLocalRecord, removeLocalRecord, setLocalRecord } from '@/data/localDb';

const VAULT_STORAGE_KEY = 'babygrowth_v4_google_passkey_token_vault';
const VAULT_VERSION = 1;
const HKDF_INFO = 'kinly/google-passkey-token-vault/v1';
const RANDOM_BYTES = 32;
const AES_GCM_IV_BYTES = 12;

export type PasskeyTokenVaultPurpose = 'prototype' | 'google-refresh-token';

export type PasskeyTokenVaultErrorCode =
  | 'unsupported'
  | 'already-exists'
  | 'not-found'
  | 'wrong-purpose'
  | 'invalid-record'
  | 'rp-mismatch'
  | 'prf-unavailable'
  | 'unlock-cancelled'
  | 'decrypt-failed';

export class PasskeyTokenVaultError extends Error {
  readonly code: PasskeyTokenVaultErrorCode;

  constructor(code: PasskeyTokenVaultErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PasskeyTokenVaultError';
    this.code = code;
  }
}

interface StoredPasskeyTokenVaultV1 {
  version: 1;
  credentialId: string;
  rpId: string;
  prfInput: string;
  hkdfSalt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
  purpose?: PasskeyTokenVaultPurpose;
  updatedAt?: string;
}

interface PrfCreationExtensionInput {
  prf: {
    eval: {
      first: BufferSource;
    };
  };
}

interface PrfRequestExtensionInput {
  prf: {
    evalByCredential: Record<string, {
      first: BufferSource;
    }>;
  };
}

interface PrfExtensionOutput {
  enabled?: boolean;
  results?: {
    first?: BufferSource;
  };
}

interface PublicKeyCredentialLike extends Credential {
  readonly rawId: ArrayBuffer;
  getClientExtensionResults(): AuthenticationExtensionsClientOutputs;
}

type PrfCreationOptions = Omit<PublicKeyCredentialCreationOptions, 'extensions'> & {
  extensions: AuthenticationExtensionsClientInputs & PrfCreationExtensionInput;
};

type PrfRequestOptions = Omit<PublicKeyCredentialRequestOptions, 'extensions'> & {
  extensions: AuthenticationExtensionsClientInputs & PrfRequestExtensionInput;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bufferSourceToBytes(source: BufferSource): Uint8Array {
  const view = source instanceof ArrayBuffer
    ? new Uint8Array(source)
    : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  return Uint8Array.from(view);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new PasskeyTokenVaultError('invalid-record', 'Vault passkey có dữ liệu Base64URL không hợp lệ.');
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isPublicKeyCredentialLike(value: Credential | null): value is PublicKeyCredentialLike {
  return value !== null
    && value.type === 'public-key'
    && 'rawId' in value
    && value.rawId instanceof ArrayBuffer
    && 'getClientExtensionResults' in value
    && typeof value.getClientExtensionResults === 'function';
}

function readPrfExtension(credential: PublicKeyCredentialLike): PrfExtensionOutput {
  const outputs = credential.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & { prf?: PrfExtensionOutput };
  return outputs.prf ?? {};
}

function readPrfOutput(credential: PublicKeyCredentialLike): Uint8Array | null {
  const output = readPrfExtension(credential).results?.first;
  return output ? bufferSourceToBytes(output) : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isVaultPurpose(value: unknown): value is PasskeyTokenVaultPurpose {
  return value === undefined || value === 'prototype' || value === 'google-refresh-token';
}

function parseStoredVault(raw: string): StoredPasskeyTokenVaultV1 {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new PasskeyTokenVaultError('invalid-record', 'Vault passkey không đọc được.', { cause: error });
  }

  if (typeof value !== 'object' || value === null) {
    throw new PasskeyTokenVaultError('invalid-record', 'Vault passkey có định dạng không hợp lệ.');
  }

  const record = value as Partial<StoredPasskeyTokenVaultV1>;
  if (
    record.version !== VAULT_VERSION
    || !isNonEmptyString(record.credentialId)
    || !isNonEmptyString(record.rpId)
    || !isNonEmptyString(record.prfInput)
    || !isNonEmptyString(record.hkdfSalt)
    || !isNonEmptyString(record.iv)
    || !isNonEmptyString(record.ciphertext)
    || !isNonEmptyString(record.createdAt)
    || !isVaultPurpose(record.purpose)
    || (record.updatedAt !== undefined && !isNonEmptyString(record.updatedAt))
  ) {
    throw new PasskeyTokenVaultError('invalid-record', 'Vault passkey thiếu metadata bắt buộc.');
  }

  return record as StoredPasskeyTokenVaultV1;
}

function assertWebAuthnPrerequisites(): void {
  if (typeof window === 'undefined' || window.isSecureContext !== true) {
    throw new PasskeyTokenVaultError('unsupported', 'Passkey vault chỉ hoạt động trong secure context HTTPS.');
  }
  if (typeof navigator === 'undefined' || !navigator.credentials) {
    throw new PasskeyTokenVaultError('unsupported', 'Trình duyệt không hỗ trợ Credential Management API.');
  }
  if (typeof PublicKeyCredential === 'undefined') {
    throw new PasskeyTokenVaultError('unsupported', 'Trình duyệt không hỗ trợ WebAuthn passkey.');
  }
}

function currentRpId(): string {
  const rpId = window.location.hostname;
  if (!rpId) throw new PasskeyTokenVaultError('unsupported', 'Không xác định được WebAuthn relying party ID.');
  return rpId;
}

function additionalData(record: Pick<StoredPasskeyTokenVaultV1, 'credentialId' | 'rpId'>): ArrayBuffer {
  return toArrayBuffer(textEncoder.encode(`${HKDF_INFO}\n${record.rpId}\n${record.credentialId}`));
}

async function deriveEncryptionKey(prfOutput: Uint8Array, hkdfSalt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', toArrayBuffer(prfOutput), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(hkdfSalt),
      info: toArrayBuffer(textEncoder.encode(HKDF_INFO)),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function requestPrfOutput(credentialId: string, rpId: string, prfInput: Uint8Array): Promise<Uint8Array> {
  const publicKey: PrfRequestOptions = {
    challenge: toArrayBuffer(randomBytes(RANDOM_BYTES)),
    rpId,
    allowCredentials: [{
      type: 'public-key',
      id: toArrayBuffer(base64UrlToBytes(credentialId)),
    }],
    userVerification: 'required',
    timeout: 60_000,
    extensions: {
      prf: {
        evalByCredential: {
          [credentialId]: { first: toArrayBuffer(prfInput) },
        },
      },
    },
  };

  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get({ publicKey: publicKey as PublicKeyCredentialRequestOptions });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new PasskeyTokenVaultError('unlock-cancelled', 'Đã hủy hoặc hết thời gian xác thực passkey.', { cause: error });
    }
    if (error instanceof DOMException && error.name === 'NotSupportedError') {
      throw new PasskeyTokenVaultError('prf-unavailable', 'Trình duyệt hoặc passkey này không hỗ trợ WebAuthn PRF khi xác thực.', { cause: error });
    }
    throw error;
  }

  if (!isPublicKeyCredentialLike(credential)) {
    throw new PasskeyTokenVaultError('prf-unavailable', 'Trình xác thực không trả về WebAuthn public-key credential.');
  }
  const prf = readPrfExtension(credential);
  if (prf.enabled === false) {
    throw new PasskeyTokenVaultError('prf-unavailable', 'Passkey này không hỗ trợ WebAuthn PRF.');
  }
  const output = readPrfOutput(credential);
  if (!output || output.byteLength < 32) {
    throw new PasskeyTokenVaultError('prf-unavailable', 'Passkey không trả về PRF output cần để mở khóa vault.');
  }
  return output;
}

async function createCredentialAndPrf(rpId: string, prfInput: Uint8Array): Promise<{ credentialId: string; prfOutput: Uint8Array }> {
  const publicKey: PrfCreationOptions = {
    challenge: toArrayBuffer(randomBytes(RANDOM_BYTES)),
    rp: { id: rpId, name: 'Kinly' },
    user: {
      id: toArrayBuffer(randomBytes(RANDOM_BYTES)),
      name: 'kinly-local-vault',
      displayName: 'Kinly local vault',
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
    timeout: 60_000,
    attestation: 'none',
    extensions: {
      prf: {
        eval: { first: toArrayBuffer(prfInput) },
      },
    },
  };

  let credential: Credential | null;
  try {
    credential = await navigator.credentials.create({ publicKey: publicKey as PublicKeyCredentialCreationOptions });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new PasskeyTokenVaultError('unlock-cancelled', 'Đã hủy hoặc hết thời gian tạo passkey.', { cause: error });
    }
    if (error instanceof DOMException && error.name === 'NotSupportedError') {
      throw new PasskeyTokenVaultError('prf-unavailable', 'Trình duyệt hoặc platform authenticator không hỗ trợ WebAuthn PRF.', { cause: error });
    }
    throw error;
  }

  if (!isPublicKeyCredentialLike(credential)) {
    throw new PasskeyTokenVaultError('prf-unavailable', 'Trình xác thực không tạo được WebAuthn public-key credential.');
  }

  const credentialId = bytesToBase64Url(new Uint8Array(credential.rawId));
  const creationOutput = readPrfOutput(credential);
  const prfOutput = creationOutput ?? await requestPrfOutput(credentialId, rpId, prfInput);
  return { credentialId, prfOutput };
}

async function encryptSecret(
  secret: string,
  record: Pick<StoredPasskeyTokenVaultV1, 'credentialId' | 'rpId' | 'hkdfSalt'>,
  prfOutput: Uint8Array,
): Promise<{ iv: string; ciphertext: string }> {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const key = await deriveEncryptionKey(prfOutput, base64UrlToBytes(record.hkdfSalt));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: additionalData(record),
    },
    key,
    toArrayBuffer(textEncoder.encode(secret)),
  );
  return {
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function isPasskeyTokenVaultSupported(): Promise<boolean> {
  try {
    assertWebAuthnPrerequisites();
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function hasPasskeyTokenVault(): Promise<boolean> {
  const raw = await getLocalRecord(VAULT_STORAGE_KEY);
  if (!raw) return false;
  parseStoredVault(raw);
  return true;
}

export async function hasGoogleRefreshTokenInPasskeyVault(): Promise<boolean> {
  const raw = await getLocalRecord(VAULT_STORAGE_KEY);
  if (!raw) return false;
  return parseStoredVault(raw).purpose === 'google-refresh-token';
}

export async function createPasskeyTokenVault(secret: string, purpose: PasskeyTokenVaultPurpose = 'prototype'): Promise<void> {
  if (!secret) throw new TypeError('Passkey token vault secret must not be empty.');
  assertWebAuthnPrerequisites();
  if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) {
    throw new PasskeyTokenVaultError('unsupported', 'Thiết bị không có platform authenticator phù hợp cho passkey vault.');
  }
  if (await getLocalRecord(VAULT_STORAGE_KEY)) {
    throw new PasskeyTokenVaultError('already-exists', 'Vault passkey đã tồn tại trên thiết bị này.');
  }

  const rpId = currentRpId();
  const prfInput = randomBytes(RANDOM_BYTES);
  const hkdfSalt = randomBytes(RANDOM_BYTES);
  const { credentialId, prfOutput } = await createCredentialAndPrf(rpId, prfInput);
  const encrypted = await encryptSecret(secret, {
    credentialId,
    rpId,
    hkdfSalt: bytesToBase64Url(hkdfSalt),
  }, prfOutput);

  const now = new Date().toISOString();
  const record: StoredPasskeyTokenVaultV1 = {
    version: VAULT_VERSION,
    credentialId,
    rpId,
    prfInput: bytesToBase64Url(prfInput),
    hkdfSalt: bytesToBase64Url(hkdfSalt),
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    createdAt: now,
    purpose,
    updatedAt: now,
  };
  await setLocalRecord(VAULT_STORAGE_KEY, JSON.stringify(record));
}

async function replacePasskeyTokenVaultSecret(secret: string, purpose: PasskeyTokenVaultPurpose): Promise<void> {
  if (!secret) throw new TypeError('Passkey token vault secret must not be empty.');
  assertWebAuthnPrerequisites();
  const raw = await getLocalRecord(VAULT_STORAGE_KEY);
  if (!raw) {
    await createPasskeyTokenVault(secret, purpose);
    return;
  }
  const record = parseStoredVault(raw);
  if (record.rpId !== currentRpId()) {
    throw new PasskeyTokenVaultError('rp-mismatch', 'Vault passkey thuộc một relying party ID khác.');
  }
  const prfOutput = await requestPrfOutput(record.credentialId, record.rpId, base64UrlToBytes(record.prfInput));
  const encrypted = await encryptSecret(secret, record, prfOutput);
  await setLocalRecord(VAULT_STORAGE_KEY, JSON.stringify({
    ...record,
    ...encrypted,
    purpose,
    updatedAt: new Date().toISOString(),
  } satisfies StoredPasskeyTokenVaultV1));
}

export async function storeGoogleRefreshTokenInPasskeyVault(refreshToken: string): Promise<void> {
  await replacePasskeyTokenVaultSecret(refreshToken, 'google-refresh-token');
}

export async function unlockPasskeyTokenVault(): Promise<string> {
  assertWebAuthnPrerequisites();
  const raw = await getLocalRecord(VAULT_STORAGE_KEY);
  if (!raw) throw new PasskeyTokenVaultError('not-found', 'Chưa có vault passkey trên thiết bị này.');
  const record = parseStoredVault(raw);
  if (record.rpId !== currentRpId()) {
    throw new PasskeyTokenVaultError('rp-mismatch', 'Vault passkey thuộc một relying party ID khác.');
  }

  const prfOutput = await requestPrfOutput(record.credentialId, record.rpId, base64UrlToBytes(record.prfInput));
  const key = await deriveEncryptionKey(prfOutput, base64UrlToBytes(record.hkdfSalt));
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(base64UrlToBytes(record.iv)),
        additionalData: additionalData(record),
      },
      key,
      toArrayBuffer(base64UrlToBytes(record.ciphertext)),
    );
    return textDecoder.decode(plaintext);
  } catch (error) {
    throw new PasskeyTokenVaultError('decrypt-failed', 'Không thể giải mã vault bằng passkey hiện tại.', { cause: error });
  }
}

export async function unlockGoogleRefreshTokenFromPasskeyVault(): Promise<string> {
  const raw = await getLocalRecord(VAULT_STORAGE_KEY);
  if (!raw || parseStoredVault(raw).purpose !== 'google-refresh-token') {
    throw new PasskeyTokenVaultError('wrong-purpose', 'Chưa có Google refresh token được bảo vệ bằng Passkey trên thiết bị này.');
  }
  return unlockPasskeyTokenVault();
}

export async function clearPasskeyTokenVault(): Promise<void> {
  await removeLocalRecord(VAULT_STORAGE_KEY);
}
