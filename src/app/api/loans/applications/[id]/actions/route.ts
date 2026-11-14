// Application actions — state machine + guarantors + approval bands + disbursement (guide §10.2).
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { canTransition, checkGuarantorEligibility, disburseLoan } from '@/lib/loans/service';
import { notifyPerson } from '@/lib/notify';
import { fmtMoney } from '@/lib/money';
import { getSettings } from '@/lib/settings';
import { seqNo } from '@/lib/core-utils';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('invite_guarantor'), guarantorMemberId: z.string(), guaranteedAmountCents: z.coerce.number().int().positive() }),
  z.object({ action: z.literal('record_manual_guarantor'), guarantorId: z.string() }),
  z.object({ action: z.literal('vet'), notes: z.string().optional() }),
  z.object({ action: z.literal('approve'), approvedAmountCents: z.coerce.number().int().positive().optional() }),
  z.object({ action: z.literal('reject'), reason: z.string().min(3) }),
  z.object({ action: z.literal('cancel'), reason: z.string().optional() }),
  z.object({ action: z.literal('disburse'), channel: z.enum(['COUNTER', 'MPESA', 'BANK', 'PESAPAL']), channelRef: z.string().optional() }),
]);

export const POST = withPermission(null, async ({ req, params, session }) => {
  const { id } = params;
  const d = await body(req, schema);
  const app = await db.loanApplication.findUnique({ where: { id }, include: { product: true, memberProfile: true, guarantors: true, loan: true } });
  if (!app) return err('Application not found', 404);

  const limits = await getSettings('limits');
  const trail = ((app.approvalTrail as any[]) ?? []).slice();

  // ---------------- guarantor invite
  if (d.action === 'invite_guarantor') {
    if (app.status !== 'GUARANTOR_PENDING' && app.status !== 'SUBMITTED') return err('Guarantors can only be invited while the application awaits them', 400);
    try {
      await checkGuarantorEligibility(d.guarantorMemberId, d.guaranteedAmountCents, app.memberProfileId);
    } catch (e) {
      return err((e as Error).message, 400);
    }
    const g = await db.guarantor.create({
      data: {
        applicationId: id, guarantorMemberId: d.guarantorMemberId, guaranteedAmountCents: d.guaranteedAmountCents,
        status: 'PENDING', method: 'PORTAL_LINK', expiresAt: new Date(Date.now() + 7 * 86400000),
        consentRef: seqNo('GUAR'),
      },
    });
    const guarantor = await db.memberProfile.findUnique({ where: { id: d.guarantorMemberId } });
    await notifyPerson(
      { name: guarantor?.firstName, email: guarantor?.email, phone: guarantor?.phone },
      'loan_guarantor_request',
      {
        name: guarantor?.firstName ?? '', applicantName: `${app.memberProfile.firstName} ${app.memberProfile.lastName}`,
        memberNumber2: '', amount: fmtMoney(app.requestedAmountCents), guaranteeAmount: fmtMoney(d.guaranteedAmountCents),
      },
    ).catch(() => null);
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'GUARANTOR_INVITE', module: 'loans', entity: 'Guarantor', entityId: g.id, after: { application: app.applicationNumber }, severity: 'info' });
    return ok({ guarantorId: g.id });
  }

  // ---------------- manual guarantor consent record
  if (d.action === 'record_manual_guarantor') {
    await db.guarantor.update({ where: { id: d.guarantorId }, data: { status: 'MANUAL_RECORDED', method: 'MANUAL', respondedAt: new Date() } });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'GUARANTOR_MANUAL', module: 'loans', entity: 'Guarantor', entityId: d.guarantorId, severity: 'warn' });
    return ok({ done: true });
  }

  // ---------------- vetting (scorecard computed here)
  if (d.action === 'vet') {
    if (app.status !== 'VETTING') {
      // from GUARANTOR_PENDING when all accepted
      const allAccepted = app.guarantors.length > 0 && app.guarantors.every((g) => g.status === 'ACCEPTED' || g.status === 'MANUAL_RECORDED');
      if (!(app.status === 'GUARANTOR_PENDING' && allAccepted && app.product.requiredGuarantors > 0)) {
        return err(`Cannot vet from ${app.status}`, 400);
      }
    }
    const member = await db.memberProfile.findUnique({
      where: { id: app.memberProfileId },
      include: { savingsAccounts: true, loans: true, sharePosition: true },
    });
    const savingsTotal = member.savingsAccounts.reduce((s, a) => s + a.balanceCents, 0);
    const onTime = member.loans.filter((l) => l.status === 'CLOSED').length;
    const installment = app.requestedAmountCents / app.termMonths;
    const dti = member.monthlyIncomeCents > 0 ? installment / member.monthlyIncomeCents : 1;
    const score = Math.round(
      Math.min(30, savingsTotal / 100_000) +
      Math.min(25, onTime * 12) +
      Math.min(20, app.guarantors.filter((g) => g.status === 'ACCEPTED').length * 10) +
      (dti <= 0.33 ? 25 : dti <= 0.5 ? 12 : 0),
    );
    const recommendation = score >= 70 && dti <= 0.5 ? 'APPROVE' : score >= 50 ? 'REDUCE_AMOUNT' : 'DECLINE';
    const scoreCard = { score, recommendation, savingsTotal, onTimeClosedLoans: onTime, dtiRatio: Number(dti.toFixed(2)), notes: d.notes ?? '', vettedById: session.user.id, vettedAt: new Date().toISOString() };
    await db.loanApplication.update({ where: { id }, data: { status: 'VETTING', scoreCard: scoreCard as any, approvalTrail: [...trail, { at: new Date().toISOString(), role: session.user.designation ?? session.user.role, decision: 'VETTED', score }] as any } });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'LOAN_VET', module: 'loans', entity: 'LoanApplication', entityId: id, after: scoreCard, severity: 'info' });
    return ok(scoreCard);
  }

  // ---------------- approve (band-checked, multi-level)
  if (d.action === 'approve') {
    if (app.status !== 'VETTING') return err(`Cannot approve from ${app.status}`, 400);
    const amount = d.approvedAmountCents ?? app.requestedAmountCents;
    const perm = amount <= limits.approvalBands[0].b1Cents ? 'loans_approve_b1'
      : amount <= limits.approvalBands[1].b2Cents ? 'loans_approve_b2' : 'loans_approve_b3';
    if (session.user.role !== 'SUPER_ADMIN' && !session.user.permissions.includes(perm)) {
      return err(`This amount needs a higher approval band (${perm})`, 403);
    }
    if (app.loan) return err('Already disbursed', 409);
    await db.loanApplication.update({
      where: { id },
      data: {
        status: 'APPROVED', approvedAmountCents: amount,
        approvalTrail: [...trail, { at: new Date().toISOString(), role: session.user.designation ?? session.user.role, decision: 'APPROVED', amount }] as any,
      },
    });
    await notifyPerson(
      { name: app.memberProfile.firstName, email: app.memberProfile.email, phone: app.memberProfile.phone },
      'loan_approved',
      { name: app.memberProfile.firstName, amount: fmtMoney(amount), productName: app.product.name },
    ).catch(() => null);
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'LOAN_APPROVE', module: 'loans', entity: 'LoanApplication', entityId: id, after: { amount }, severity: 'critical' });
    return ok({ status: 'APPROVED', amount });
  }

  // ---------------- reject / cancel
  if (d.action === 'reject' || d.action === 'cancel') {
    const to = d.action === 'reject' ? 'REJECTED' : 'CANCELLED';
    if (!canTransition(app.status, to)) return err(`Cannot move ${app.status} → ${to}`, 400);
    await db.loanApplication.update({
      where: { id },
      data: { status: to, rejectionReason: d.reason, approvalTrail: [...trail, { at: new Date().toISOString(), role: session.user.designation ?? session.user.role, decision: to, reason: d.reason }] as any },
    });
    // release pending guarantors
    await db.guarantor.updateMany({ where: { applicationId: id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
    if (d.action === 'reject') {
      await notifyPerson(
        { name: app.memberProfile.firstName, email: app.memberProfile.email, phone: app.memberProfile.phone },
        'loan_rejected',
        { name: app.memberProfile.firstName, applicationNumber: app.applicationNumber, reason: d.reason },
      ).catch(() => null);
    }
    await audit({ userId: session.user.id, userRole: session.user.role, action: `LOAN_${d.action.toUpperCase()}`, module: 'loans', entity: 'LoanApplication', entityId: id, after: { reason: d.reason }, severity: 'warn' });
    return ok({ status: to });
  }

  // ---------------- disburse
  if (d.action === 'disburse') {
    if (session.user.role !== 'SUPER_ADMIN' && !session.user.permissions.includes('loans_disburse')) {
      return err('Disbursement permission required', 403);
    }
    if (app.loan) return err('Loan already disbursed', 409);
    try {
      const result = await disburseLoan({ applicationId: id, channel: d.channel, channelRef: d.channelRef, performedById: session.user.id });
      const firstDue = result.schedule[0];
      const member = app.memberProfile;
      await notifyPerson(
        { name: member.firstName, email: member.email, phone: member.phone },
        'loan_disbursed',
        {
          name: member.firstName, amount: fmtMoney((app.approvedAmountCents ?? app.requestedAmountCents)),
          loanNumber: result.loanNumber, channel: d.channel, ref: d.channelRef ?? '—',
          installment: fmtMoney(firstDue?.totalDueCents ?? 0), dueDate: (firstDue?.dueDate ?? new Date()).toISOString().slice(0, 10),
        },
      ).catch(() => null);
      await audit({ userId: session.user.id, userRole: session.user.role, action: 'LOAN_DISBURSE', module: 'loans', entity: 'Loan', entityId: result.loanId, after: { loanNumber: result.loanNumber, net: result.net }, severity: 'critical' });
      return ok({ loanNumber: result.loanNumber, loanId: result.loanId, net: result.net, fees: result.fees });
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }

  return err('Unknown action', 400);
});
