// Loan applications — list + create (member self OR admin-on-behalf) — guide §10.2.2/§10.4.
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { nextSequence } from '@/lib/core-utils';
import { checkEligibility } from '@/lib/loans/service';
import { notifyPerson } from '@/lib/notify';
import { fmtMoney } from '@/lib/money';
import { getSettings } from '@/lib/settings';

const createSchema = z.object({
  memberProfileId: z.string(),
  productId: z.string(),
  requestedAmountCents: z.coerce.number().int().positive(),
  termMonths: z.coerce.number().int().min(1),
  purpose: z.string().optional(),
  onBehalf: z.boolean().default(false),
});

export const GET = withAuth('loans_view', async ({ req }) => {
  const q = query(req);
  const rows = await db.loanApplication.findMany({
    where: {
      ...(q.status ? { status: q.status } : {}),
      ...(q.memberId ? { memberProfileId: q.memberId } : {}),
      ...(q.search ? { OR: [{ applicationNumber: { contains: q.search } }, { memberProfile: { OR: [{ firstName: { contains: q.search } }, { lastName: { contains: q.search } }, { memberNumber: { contains: q.search } }] } }] } : {}),
    },
    include: {
      memberProfile: { select: { memberNumber: true, firstName: true, lastName: true, phone: true, email: true } },
      product: { select: { name: true, code: true, interestRateBps: true, interestMethod: true } },
      guarantors: { include: { guarantorMember: { select: { memberNumber: true, firstName: true, lastName: true, phone: true } } } },
      loan: { select: { id: true, loanNumber: true, status: true } },
    },
    orderBy: { appliedAt: 'desc' },
    take: 400,
  });
  return ok(rows.map((a) => ({
    id: a.id, applicationNumber: a.applicationNumber,
    member: `${a.memberProfile.firstName} ${a.memberProfile.lastName} (${a.memberProfile.memberNumber})`,
    memberId: a.memberProfileId,
    product: a.product.name, productCode: a.product.code,
    rate: a.product.interestRateBps, method: a.product.interestMethod,
    requestedAmountCents: a.requestedAmountCents, approvedAmountCents: a.approvedAmountCents ?? null,
    termMonths: a.termMonths, purpose: a.purpose ?? '—',
    status: a.status, requestedBy: a.requestedBy, appliedAt: a.appliedAt,
    guarantors: a.guarantors.map((g) => ({
      id: g.id, name: `${g.guarantorMember.firstName} ${g.guarantorMember.lastName} (${g.guarantorMember.memberNumber})`,
      amountCents: g.guaranteedAmountCents, status: g.status, method: g.method, expiresAt: g.expiresAt,
    })),
    loan: a.loan ? { id: a.loan.id, loanNumber: a.loan.loanNumber, status: a.loan.status } : null,
    approvalTrail: (a.approvalTrail as any[]) ?? [],
    scoreCard: a.scoreCard ?? null,
  })));
});

export const POST = withPermission('loans_apply_on_behalf', async ({ req, session }) => {
  const d = await body(req, createSchema);
  try {
    // eligibility (throws with reason) — also returns product
    const { product } = await checkEligibility(d.memberProfileId, d.productId, d.requestedAmountCents, d.termMonths);
    const limits = await getSettings('limits');
    const band = d.requestedAmountCents <= limits.approvalBands[0].b1Cents ? 'B1' : d.requestedAmountCents <= limits.approvalBands[1].b2Cents ? 'B2' : 'B3';
    const member = await db.memberProfile.findUnique({ where: { id: d.memberProfileId } });
    const applicationNumber = await nextSequence(db, 'loanApp');
    const app = await db.loanApplication.create({
      data: {
        applicationNumber, memberProfileId: d.memberProfileId, productId: d.productId,
        requestedAmountCents: d.requestedAmountCents, termMonths: d.termMonths, purpose: d.purpose ?? null,
        requestedBy: d.onBehalf ? 'ADMIN_ON_BEHALF' : 'MEMBER',
        submittedById: session.user.id,
        status: product.requiredGuarantors > 0 ? 'GUARANTOR_PENDING' : 'VETTING',
        approvalTrail: [{ at: new Date().toISOString(), role: session.user.role, note: `Created ${d.onBehalf ? 'on behalf of member' : 'by member'}; band ${band}` }],
      },
    });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'LOAN_APPLICATION_CREATE', module: 'loans', entity: 'LoanApplication', entityId: app.id, after: { applicationNumber }, severity: 'info' });
    await notifyPerson(
      { name: member?.firstName, email: member?.email, phone: member?.phone },
      'loan_received',
      { name: member?.firstName ?? '', applicationNumber, productName: product.name, amount: fmtMoney(d.requestedAmountCents), term: `${d.termMonths} months` },
    ).catch(() => null);
    return ok({ id: app.id, applicationNumber, status: app.status });
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
