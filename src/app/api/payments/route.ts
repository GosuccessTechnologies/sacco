// Payments log + allocation of suspense — guide §14.4.
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { postSavingsTransaction } from '@/lib/savings/service';
import { postLoanRepayment } from '@/lib/loans/service';

export const GET = withAuth('payments_view', async ({ req }) => {
  const q = query(req);
  const rows = await db.paymentTransaction.findMany({
    where: {
      ...(q.status ? { status: q.status } : {}),
      ...(q.purpose ? { purpose: q.purpose } : {}),
      ...(q.search ? { OR: [{ requestRef: { contains: q.search } }, { mpesaReceipt: { contains: q.search } }, { phone: { contains: q.search } }] } : {}),
    },
    include: { memberProfile: { select: { memberNumber: true, firstName: true, lastName: true } }, account: { select: { accountNumber: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return ok(rows.map((p) => ({
    id: p.id, requestRef: p.requestRef, provider: p.provider, type: p.type, purpose: p.purpose,
    member: p.memberProfile ? `${p.memberProfile.firstName} ${p.memberProfile.lastName} (${p.memberProfile.memberNumber})` : '—',
    accountNumber: p.account?.accountNumber ?? '—',
    amountCents: p.amountCents, phone: p.phone ?? '—', status: p.status,
    receipt: p.mpesaReceipt ?? '', narration: p.narration ?? '',
    createdAt: p.createdAt, completedAt: p.completedAt,
  })));
});
