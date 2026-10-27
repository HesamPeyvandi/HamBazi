import { createHmac, randomBytes, randomInt, timingSafeEqual, createHash } from 'node:crypto';
import { env } from '../env';

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
export function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}
export function otpHash(challengeId: string, phone: string, code: string): string {
  return hmac(env().otpSecret, `${challengeId}:${phone}:${code}`);
}
export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}
export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
export function ipHash(ip: string | null | undefined): string | null {
  return ip ? hmac(env().sessionSecret, 'ip:' + ip).slice(0, 32) : null;
}
