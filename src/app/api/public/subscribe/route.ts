import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/api';

const schema = z.object({
  name: z.string().max(90).optional(),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+?[0-9\s-]{9,15}$/).optional(),
}).refine((d) => d.email || d.phone, { message: 'Email or phone required' });

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  if (!rateLimit(`sub:${ip}`, 10, 3600_000)) {
    return Response.json({ error: 'Too many attempts. Try later.' }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid' }, { status: 422 });
  const { name, email, phone } = parsed.data;
  const existing = await db.subscriber.findFirst({
    where: { OR: [{ email: email ?? '__none__' }, { phone: phone ?? '__none__' }], status: 'ACTIVE' },
  });
  if (existing) return Response.json({ ok: true, message: 'Already subscribed' });
  await db.subscriber.create({ data: { name: name ?? null, email: email ?? null, phone: phone ?? null, source: 'WEB_FOOTER' } });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  const phone = url.searchParams.get('phone');
  if (email) await db.subscriber.updateMany({ where: { email }, data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() } });
  if (phone) await db.subscriber.updateMany({ where: { phone }, data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() } });
  return Response.json({ ok: true });
}
