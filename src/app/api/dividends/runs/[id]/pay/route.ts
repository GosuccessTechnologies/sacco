// Approve + pay a dividend run — guide §11.2.3 (dual control: APPROVE then PAY).
import { withPermission, ok, err, body } from '@/lib/api';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { payDividendRun } from '@/lib/shares/service';
import { notifyPerson } from '@/lib/notify';
import { fmtMoney } from '@/lib/money';
import { z } from 'zod';

const schema = z.object({ action: z.enum(['approve', 'pay']) });

export const POST = withPermission(null, async ({ req, params, session }) => {
  const { id } = params;
  const { action } = await body(req, schema);
  const run = await db.dividendRun.findUnique({ where: { id } });
  if (!run) return err('Run not found', 404);

  if (action === 'approve') {
    if (session.user.role !== 'SUPER_ADMIN' && !session.user.permissions.includes('dividends_approve')) {
      return err('Dividend approval permission required (manager or super admin)', 403);
    }
    if (run.status !== 'CALCULATED') return err('Run must be CALCULATED before approval', 400);
    await db.dividendRun.update({ where: { id }, data: { status: 'APPROVED', approvedById: session.user.id, approvedAt: new Date() } });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'DIVIDEND_APPROVE', module: 'dividends', entity: 'DividendRun', entityId: id, severity: 'critical' });
    return ok({ status: 'APPROVED' });
  }

  // pay
  if (session.user.role !== 'SUPER_ADMIN' && !session.user.permissions.includes('dividends_pay')) {
    return err('Dividend payout permission required', 403);
  }
  if (run.status !== 'APPROVED') return err('Run must be APPROVED before paying', 400);
  const result = await payDividendRun(id, session.user.id);
  const entries = await db.dividendEntry.findMany({ where: { runId: id, paidAt: { not: null } }, include: { memberProfile: true } });
  for (const e of entries) {
    await notifyPerson(
      { name: e.memberProfile.firstName, email: e.memberProfile.email, phone: e.memberProfile.phone },
      'dividend_paid',
      { name: e.memberProfile.firstName, payout: fmtMoney(e.totalPayoutCents), channel: 'savings account credit', year: run.year },
    ).catch(() => null);
  }
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'DIVIDEND_PAY', module: 'dividends', entity: 'DividendRun', entityId: id, after: result, severity: 'critical' });
  return ok({ status: 'PAID', ...result });
});
