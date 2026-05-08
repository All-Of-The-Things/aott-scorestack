import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import prisma from './prisma'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY env var is required for credential storage')
  const buf = Buffer.from(raw, 'hex')
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars)')
  return buf
}

export function encryptCredential(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // format: iv(12) + tag(16) + ciphertext — all hex-encoded
  return Buffer.concat([iv, tag, encrypted]).toString('hex')
}

export function decryptCredential(ciphertext: string): string {
  const key = getKey()
  const buf = Buffer.from(ciphertext, 'hex')
  const iv = buf.subarray(0, IV_BYTES)
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const encrypted = buf.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final('utf8')
}

export async function getOrgConnectSafelyKey(orgId: string): Promise<string | null> {
  const integration = await prisma.orgIntegration.findUnique({
    where: { orgId },
    select: { connectSafelyApiKey: true },
  })
  if (!integration?.connectSafelyApiKey) return null
  return decryptCredential(integration.connectSafelyApiKey)
}
