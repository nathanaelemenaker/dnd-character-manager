import { hash, verify } from '@node-rs/argon2';

export async function hashPassword(pw: string) {
  return hash(pw);
}

export async function verifyPassword(pw: string, hashed: string) {
  return verify(hashed, pw);
}
