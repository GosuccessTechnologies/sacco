// Approve a reconciliation — locks the period (guide §13.8).
import { withPermission, ok, err } from '@/lib/api';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

export const POST = withPermission('accounting_reconcile_approve', async ({ params, session }) => {
  const { id } = params;
  const rec = await db.bankReconciliation.findUnique({ where: { id } });
  if (!rec) return err('Reconciliation not found', 404);
  if (rec.status === 'APPROVED') return err('Already approved', 409);
  if (rec.differenceCents !== 0) {
    return err(`Difference is ${rec.differenceCents / 100} KES — must be zero (post adjusting entries) before approval`, 400);
  }
  await db.bankReconciliation.update({ where: { id }, data: { status: 'APPROVED', approvedById: session.user.id, approvedAt: new Date() } });
  // mark all matched lines in period as RECONCILED
  await db.bankStatementLine.updateMany({
    where: { bankAccountId: rec.bankAccountId, statementDate: { gte: rec.periodFrom, lte: rec.periodTo }, status: 'MATCHED' },
    data: { status: 'RECONCILED' },
  });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'RECON_APPROVE', module: 'accounting', entity: 'BankReconciliation', entityId: id, severity: 'critical' });
  return ok({ status: 'APPROVED' });
});
