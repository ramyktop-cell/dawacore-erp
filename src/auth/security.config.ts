import { createHash } from 'crypto';
export const JWT_ISSUER = 'dawacore';
export const JWT_AUDIENCE = 'dawacore-app';
export function requireJwtSecret(value: string | undefined): string {
 if (!value || Buffer.byteLength(value) < 48 || /dawacore|change.?me|example/i.test(value)) {
  throw new Error('JWT_SECRET must be an independently generated secret of at least 48 bytes');
 }
 return value;
}
// Password changes invalidate previously issued tokens without a schema migration.
export const credentialVersion = (passwordHash: string) => createHash('sha256').update(passwordHash).digest('hex');
