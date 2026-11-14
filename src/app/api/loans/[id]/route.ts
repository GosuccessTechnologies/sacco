// Loan detail — schedule + repayments + guarantor holds (guide §10.4).
import { withAuth, ok, err } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = withAuth('loans_view', async ({ params }) => {
  const { id } = params;
  const loan = await db.loan.findUnique({
    where: { id },
    include: {
      memberProfile: { select: { memberNumber: true, firstName: true, lastName: true, phone: true, email: true, status: true, kycVerified: true } },
      product: true,
      application: { include: { guarantors: { include: { guarantorMember: { select: { memberNumber: true, firstName: true, lastName: true } } } } } },
      schedule: { orderBy: { installmentNo: 'asc' } },
      repayments: { orderBy: { createdAt: 'desc' } },
      actions: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!loan) return err('Loan not found', 404);
  return ok(loan);
});
