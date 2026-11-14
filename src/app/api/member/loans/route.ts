// Member portal — loans: my applications + my loans + apply (guide §10.6).
import { withAuth, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { checkEligibility } from '@/lib/loans/service';
import { nextSequence } from '@/lib/core-utils';
import { notifyPerson } from '@/lib/notify';
import { fmtMoney } from '@/lib/money';

export const GET = withAuth(null, async ({ req, session }) => {
  const url = new URL(req.url);
  const memberId = session.user.role === 'MEMBER' ? session.user.memberId : url.searchParams.get('memberId');
  if (!memberId) return err('memberId required', 422);
  const member = await db.memberProfile.findUnique({ where: { id: memberId } });
  if (!member) return err('Member not found', 404);
  const [products, applications, loans] = await Promise.all([
    db.loanProduct.findMany({ where: { active: true, isPublic: true }, orderBy: { sortOrder: 'asc' } }),
    db.loanApplication.findMany({ where: { memberProfileId: memberId }, include: { product: true, guarantors: { include: { guarantorMember: { select: { firstName: true, lastName: true, memberNumber: true } } } } }, orderBy: { appliedAt: 'desc' } }),
    db.loan.findMany({ where: { memberProfileId: memberId }, include: { product: true, schedule: { orderBy: { installmentNo: 'asc' } }, repayments: { orderBy: { createdAt: 'desc' }, take: 10 } }, orderBy: { disbursedAt: 'desc' } }),
  ]);
  return ok({
    member: { memberNumber: member.memberNumber, name: `${member.firstName} ${member.lastName}`, kycVerified: member.kycVerified, status: member.status },
    products: products.map((p) => ({
      id: p.id, code: p.code, name: p.name, description: p.description ?? '',
      interestMethod: p.interestMethod, interestRateBps: p.interestRateBps,
      termMinMonths: p.termMinMonths, termMaxMonths: p.termMaxMonths,
      minAmountCents: p.minAmountCents, maxAmountCents: p.maxAmountCents,
      savingsMultiplier: p.savingsMultiplier, requiredGuarantors: p.requiredGuarantors,
      guaranteeCoveragePct: p.guaranteeCoveragePct,
    })),
    applications: applications.map((a) => ({
      id: a.id, applicationNumber: a.applicationNumber, product: a.product.name,
      requestedAmountCents: a.requestedAmountCents, approvedAmountCents: a.approvedAmountCents,
      termMonths: a.termMonths, purpose: a.purpose ?? '', status: a.status,
      appliedAt: a.appliedAt, requestedBy: a.requestedBy,
      guarantors: a.guarantors.map((g) => ({
        id: g.id, name: `${g.guarantorMember.firstName} ${g.guarantorMember.lastName}`,
        amountCents: g.guaranteedAmountCents, status: g.status, expiresAt: g.expiresAt,
      })),
      scoreCard: a.scoreCard ?? null,
    })),
    loans: loans.map((l) => ({
      id: l.id, loanNumber: l.loanNumber, product: l.product.name, status: l.status,
      principalCents: l.principalCents, outstandingCents: l.outstandingCents,
      penaltyAccruedCents: l.penaltyAccruedCents, disbursedAt: l.disbursedAt,
      nextDueAt: l.nextDueAt, termMonths: l.termMonths,
      schedule: l.schedule.map((s) => ({
        installmentNo: s.installmentNo, dueDate: s.dueDate, totalDueCents: s.totalDueCents,
        principalDueCents: s.principalDueCents, interestDueCents: s.interestDueCents,
        penaltyDueCents: s.penaltyDueCents, paidCents: s.paidCents, status: s.status,
      })),
      repayments: l.repayments.map((r) => ({ reference: r.reference, amountCents: r.amountCents, channel: r.channel, valueDate: r.valueDate })),
    })),
  });
});

const applySchema = z.object({
  productId: z.string(),
  requestedAmountCents: z.coerce.number().int().positive(),
  termMonths: z.coerce.number().int().min(1),
  purpose: z.string().optional(),
});

export const POST = withAuth('loans_apply_on_behalf', async ({ req, session }) => {
  const d = await body(req, applySchema);
  const memberId = session.user.role === 'MEMBER' ? session.user.memberId : new URL(req.url).searchParams.get('memberId');
  if (!memberId) return err('memberId required', 422);
  try {
    const { product } = await checkEligibility(memberId, d.productId, d.requestedAmountCents, d.termMonths);
    const member = await db.memberProfile.findUnique({ where: { id: memberId } });
    const applicationNumber = await nextSequence(db, 'loanApp');
    const app = await db.loanApplication.create({
      data: {
        applicationNumber, memberProfileId: memberId, productId: d.productId,
        requestedAmountCents: d.requestedAmountCents, termMonths: d.termMonths, purpose: d.purpose ?? null,
        requestedBy: 'MEMBER', status: product.requiredGuarantors > 0 ? 'GUARANTOR_PENDING' : 'VETTING',
      },
    });
    await notifyPerson(
      { name: member?.firstName, email: member?.email, phone: member?.phone },
      'loan_received',
      { name: member?.firstName ?? '', applicationNumber, productName: product.name, amount: fmtMoney(d.requestedAmountCents), term: `${d.termMonths} months` },
    ).catch(() => null);
    return ok({ id: app.id, applicationNumber, status: app.status, needsGuarantors: product.requiredGuarantors });
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
