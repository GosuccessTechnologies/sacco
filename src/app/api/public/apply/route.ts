// Public membership application — guide §8.2.1 / §18.2.
// Rate-limited, honeypot + time-trap, zod-validated, audited, acknowledged via email/SMS.
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notifyPerson } from '@/lib/notify';
import { rateLimit } from '@/lib/api';

const schema = z.object({
  // honeypot + timing handled below
  firstName: z.string().min(2).max(60),
  middleName: z.string().max(60).optional().nullable(),
  lastName: z.string().min(2).max(60),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dateOfBirth: z.coerce.date(),
  nationalId: z.string().regex(/^\d{6,12}$/),
  passportNo: z.string().max(30).optional().nullable(),
  kraPin: z.string().max(20).optional().nullable(),
  phone: z.string().regex(/^\+?[0-9\s-]{9,15}$/),
  email: z.string().email().optional().nullable(),
  physicalAddress: z.string().min(4).max(160),
  town: z.string().max(80).optional().nullable(),
  county: z.string().max(80).optional().nullable(),
  occupation: z.string().max(80).optional().nullable(),
  employerName: z.string().max(120).optional().nullable(),
  monthlyIncome: z.union([z.string(), z.number()]).optional(),
  nextOfKins: z.array(z.object({
    name: z.string().min(3).max(90),
    relationship: z.string().min(2).max(40),
    phone: z.string().regex(/^\+?[0-9\s-]{9,15}$/),
    email: z.string().email().optional().nullable(),
    idNumber: z.string().max(20).optional().nullable(),
  })).min(1).max(5),
  productsInterested: z.array(z.object({ type: z.enum(['savings', 'loan']), code: z.string().max(20) })).max(10).default([]),
  agreedTerms: z.literal(true),
  honeypot: z.string().max(0).optional().nullable(),
  elapsedMs: z.coerce.number().optional(),
});

export async function POST(req: Request) {
  // rate limit: 5 per hour per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  if (!rateLimit(`apply:${ip}`, 5, 3600_000)) {
    return Response.json({ error: 'Too many applications from this network. Try again later.' }, { status: 429 });
  }
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'Please complete all required fields correctly', issues: parsed.error.issues.map((i) => i.path.join('.')) }, { status: 422 });
  }
  const d = parsed.data;
  if (d.honeypot) return Response.json({ ok: true }); // silent drop for bots
  if (d.elapsedMs !== undefined && d.elapsedMs < 3000) return Response.json({ ok: true }); // too fast = bot

  // duplicate guard
  const existing = await db.membershipApplication.findFirst({ where: { nationalId: d.nationalId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } });
  if (existing) {
    return Response.json({ error: 'An application with this ID number is already under review.' }, { status: 409 });
  }
  const memberWithId = await db.memberProfile.findUnique({ where: { nationalId: d.nationalId } });
  if (memberWithId) {
    return Response.json({ error: 'This ID number is already a registered member. Please log in or contact the office.' }, { status: 409 });
  }

  const applicationNumber = `DIVAPP-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const incomeCents = d.monthlyIncome !== undefined && d.monthlyIncome !== '' ? Math.round(Number(String(d.monthlyIncome).replace(/[,\s]/g, '')) * 100) : 0;

  const app = await db.membershipApplication.create({
    data: {
      applicationNumber,
      source: 'WEB',
      firstName: d.firstName, middleName: d.middleName ?? null, lastName: d.lastName,
      gender: d.gender, dateOfBirth: d.dateOfBirth, nationalId: d.nationalId,
      passportNo: d.passportNo ?? null, kraPin: d.kraPin ?? null,
      phone: d.phone, email: d.email ?? null, physicalAddress: d.physicalAddress,
      town: d.town ?? null, county: d.county ?? null,
      occupation: d.occupation ?? null, employerName: d.employerName ?? null,
      monthlyIncomeCents: incomeCents,
      nextOfKins: d.nextOfKins,
      productsInterested: d.productsInterested,
      agreedTermsVersion: 'terms-v1',
      status: 'SUBMITTED',
    },
  });
  await audit({ action: 'APPLICATION_PUBLIC_CREATE', module: 'members', entity: 'MembershipApplication', entityId: app.id, after: { applicationNumber }, severity: 'info' });

  // acknowledgment (non-blocking failures)
  await notifyPerson(
    { name: `${d.firstName} ${d.lastName}`, email: d.email ?? null, phone: d.phone },
    'application_received',
    { name: d.firstName, applicationNumber, amount: '', term: '' },
  ).catch(() => null);

  return Response.json({ ok: true, applicationNumber });
}
