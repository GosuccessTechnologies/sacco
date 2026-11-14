// Guarantor inbox + public token respond — guide §10.2.3.
import { withAuth, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { checkGuarantorEligibility } from '@/lib/loans/service';
import { notifyPerson } from '@/lib/notify';
import { fmtMoney } from '@/lib/money';

export const GET = withAuth(null, async ({ req, session }) => {
  const url = new URL(req.url);
  const memberId = session.user.role === 'MEMBER' ? session.user.memberId : url.searchParams.get('memberId');
  if (!memberId) return err('memberId required', 422);
  const rows = await db.guarantor.findMany({
    where: { guarantorMemberId: memberId, status: { in: ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'MANUAL_RECORDED'] } },
    include: { application: { include: { memberProfile: true, product: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return ok(rows.map((g) => ({
    id: g.id, status: g.status, method: g.method,
    applicant: `${g.application.memberProfile.firstName} ${g.application.memberProfile.lastName} (${g.application.memberProfile.memberNumber})`,
    product: g.application.product.name, amountCents: g.application.requestedAmountCents,
    guaranteedAmountCents: g.guaranteedAmountCents, expiresAt: g.expiresAt,
    applicationNumber: g.application.applicationNumber, applicationStatus: g.application.status,
  })));
});

const schema = z.object({ guarantorId: z.string(), decision: z.enum(['accept', 'decline']), otp: z.string().optional() });

export const POST = withAuth(null, async ({ req, session }) => {
  const d = await body(req, schema);
  const g = await db.guarantor.findUnique({ where: { id: d.guarantorId }, include: { application: { include: { memberProfile: true } } } });
  if (!g) return err('Request not found', 404);
  const memberId = session.user.role === 'MEMBER' ? session.user.memberId : g.guarantorMemberId;
  if (g.guarantorMemberId !== memberId) return err('This request belongs to another member', 403);
  if (g.status !== 'PENDING') return err(`Already ${g.status.toLowerCase()}`, 409);
  if (g.expiresAt && g.expiresAt < new Date()) {
    await db.guarantor.update({ where: { id: g.id }, data: { status: 'EXPIRED' } });
    return err('This request expired', 410);
  }

  if (d.decision === 'accept') {
    try { await checkGuarantorEligibility(g.guarantorMemberId, g.guaranteedAmountCents, g.application.memberProfileId); }
    catch (e) { return err((e as Error).message, 400); }
    await db.guarantor.update({ where: { id: g.id }, data: { status: 'ACCEPTED', respondedAt: new Date(), method: 'PORTAL_LINK' } });
    // all guarantors accepted → move to VETTING
    const all = await db.guarantor.findMany({ where: { applicationId: g.applicationId } });
    const required = (await db.loanProduct.findUnique({ where: { id: g.application.productId } }))?.requiredGuarantors ?? 0;
    const accepted = all.filter((x) => x.status === 'ACCEPTED' || x.status === 'MANUAL_RECORDED').length;
    if (accepted >= required && g.application.status === 'GUARANTOR_PENDING') {
      await db.loanApplication.update({ where: { id: g.applicationId }, data: { status: 'VETTING' } });
    }
    const applicant = g.application.memberProfile;
    await notifyPerson(
      { name: applicant.firstName, email: applicant.email, phone: applicant.phone },
      'loan_guarantor_request',
      { name: applicant.firstName, applicantName: `${applicant.firstName} ${applicant.lastName}`, amount: fmtMoney(g.application.requestedAmountCents), guaranteeAmount: fmtMoney(g.guaranteedAmountCents) },
    ).catch(() => null);
    return ok({ status: 'ACCEPTED' });
  }

  await db.guarantor.update({ where: { id: g.id }, data: { status: 'DECLINED', respondedAt: new Date() } });
  return ok({ status: 'DECLINED' });
});
