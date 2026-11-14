// Analytics — one endpoint, grouped datasets (guide §15.4) + role dashboards (Instr 7).
// `?want=role` is available to every authenticated staff member (permission-free,
// scoped by the caller's designation); the full analytics bundle still needs
// analytics_view.
import { withAuth, ok, err, query } from '@/lib/api';
import {
  overviewStats, membershipSeries, savingsVsLoansSeries, loanBookBreakdown,
  arrearsAging, channelCashflow, productMix,
} from '@/lib/analytics';
import {
  managerDashboard, tellerDashboard, loansDashboard, accountsDashboard,
  complianceDashboard, receptionDashboard,
} from '@/lib/role-dashboards';

export const GET = withAuth(null, async ({ req, session }) => {
  const q = query(req);
  const wants = q.want;
  const user = session.user as { id: string; role: string; designation?: string | null; permissions?: string[] };

  // ---- role dashboard payloads (Instr 7): scoped by designation, no extra permission
  if (wants === 'role') {
    if (user.role === 'MEMBER') return ok({ desk: 'MEMBER', data: null });
    const desk = (user.designation ?? '').toUpperCase();
    switch (desk) {
      case 'MANAGER':
        return ok({ desk, data: await managerDashboard() });
      case 'TELLER':
        return ok({ desk, data: await tellerDashboard(user.id) });
      case 'LOAN_OFFICER':
        return ok({ desk, data: await loansDashboard() });
      case 'ACCOUNTANT':
        return ok({ desk, data: await accountsDashboard() });
      case 'COMPLIANCE':
        return ok({ desk, data: await complianceDashboard() });
      case 'RECEPTION':
        return ok({ desk, data: await receptionDashboard() });
      default:
        // super admin / unassigned admin → institution-wide console
        return ok({ desk: 'ADMIN', data: await managerDashboard() });
    }
  }

  // ---- full analytics bundle requires analytics_view (RBAC enforced here)
  const hasPerm = user.role === 'SUPER_ADMIN' || (user.permissions?.includes('analytics_view') ?? false);
  if (!hasPerm) return err('You do not have permission to view analytics', 403);

  const [overview, membership, money, loanBook, arrears, cashflow, mix] = await Promise.all([
    overviewStats(),
    membershipSeries(Number(q.months ?? 12)),
    savingsVsLoansSeries(Number(q.months ?? 12)),
    loanBookBreakdown(),
    arrearsAging(),
    channelCashflow(),
    productMix(),
  ]);
  return ok({ overview, membership, money, loanBook, arrears, cashflow, mix });
});
