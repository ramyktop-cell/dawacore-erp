import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
@Injectable()
export class LoginRateGuard implements CanActivate {
 private readonly attempts = new Map<string, { count: number; until: number }>();
 canActivate(context: ExecutionContext): boolean {
  const req = context.switchToHttp().getRequest();
  const now = Date.now();
  for (const [key, entry] of this.attempts) if (entry.until <= now) this.attempts.delete(key);
  const key = String(req.ip || req.socket?.remoteAddress || 'unknown');
  const entry = this.attempts.get(key) || { count: 0, until: now + 60000 };
  if (entry.count >= 20 || (!this.attempts.has(key) && this.attempts.size >= 10000)) throw new HttpException('محاولات كثيرة؛ حاول بعد دقيقة', 429);
  entry.count++;
  this.attempts.set(key, entry);
  return true;
 }
}
