import crypto from 'crypto';

// Encryption key derived from a secret - in production this should be an env var
const ENCRYPTION_KEY = process.env.ENCRYPTION_SECRET || 'filadex-default-encryption-key-32b';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a string value (like an API key)
 * Returns a base64-encoded string containing IV + encrypted data + auth tag
 */
export function encrypt(text: string): string {
  // Ensure key is exactly 32 bytes for AES-256
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Combine IV + encrypted data + auth tag
  const combined = Buffer.concat([
    iv,
    Buffer.from(encrypted, 'hex'),
    authTag
  ]);
  
  return combined.toString('base64');
}

/**
 * Decrypt a string that was encrypted with the encrypt function
 */
export function decrypt(encryptedText: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const combined = Buffer.from(encryptedText, 'base64');
  
  // Extract IV, encrypted data, and auth tag
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Mask an API key for display (show only first and last 4 chars)
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 12) {
    return '****';
  }
  return `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`;
}

/**
 * Validate that a string looks like an OpenAI API key
 */
export function isValidOpenAIKeyFormat(apiKey: string): boolean {
  // OpenAI keys typically start with 'sk-' and are 51+ characters
  return /^sk-[a-zA-Z0-9_-]{40,}$/.test(apiKey);
}
