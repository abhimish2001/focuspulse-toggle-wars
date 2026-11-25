import crypto from 'crypto';

/** Constant-time comparison against ADMIN_SECRET to protect admin mutations. */
export function isAuthorizedAdmin(req: Request, body?: Record<string, unknown>): boolean {
  const expectedTrimmed = process.env.ADMIN_SECRET?.trim();
  const headerSecret = req.headers.get('x-admin-secret') || '';
  const bodySecret = typeof body?.secret === 'string' ? body.secret : '';
  const providedTrimmed = (headerSecret || bodySecret).trim();

  if (!expectedTrimmed || !providedTrimmed) return false;

  const a = Buffer.from(providedTrimmed, 'utf8');
  const b = Buffer.from(expectedTrimmed, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
