// Generate payroll entries for a run — statutory tables from settings (guide §17.2.5).
import { withPermission, ok, err } from '@/lib/api';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';
import { roundMoney } from '@/lib/money';

function paye(grossCents: number, bands: { upToCents: number; rateBps: number }[]): number {
  let remaining = grossCents;
  let lastCap = 0;
  let tax = 0;
  for (const b of bands) {
    const bandWidth = Math.min(remaining, b.upToCents - lastCap);
    if (bandWidth > 0) tax += Math.round((bandWidth * b.rateBps) / 10000);
    remaining -= bandWidth;
    lastCap = b.upToCents;
    if (remaining <= 0) break;
  }
  return tax;
}

export const POST = withPermission('payroll_run', async ({ params, session }) => {
  const { id } = params;
  const run = await db.payrollRun.findUnique({ where: { id } });
  if (!run) return err('Run not found', 404);
  if (run.status !== 'DRAFT') return err('Only DRAFT runs can be generated', 400);
  const cfg = await getSettings('payroll');
  const staff = await db.staffProfile.findMany({ where: { status: 'ACTIVE' }, include: { user: { include: { memberProfile: { include: { loans: { where: { status: { in: ['ACTIVE', 'OVERDUE', 'DEFAULTED'] } }, select: { outstandingCents: true } } } } } } } });

  await db.payrollEntry.deleteMany({ where: { runId: id } });
  let totalGross = 0, totalDeductions = 0, totalNet = 0;
  for (const s of staff) {
    const allowances = (s.allowances as Record<string, number>) ?? {};
    const allowancesTotal = Object.values(allowances).reduce((x: number, v) => x + Number(v ?? 0), 0);
    const gross = s.basicSalaryCents + allowancesTotal;
    const payeCents = paye(gross, cfg.payeBands);
    const nssf = Math.min(gross * 0.06, cfg.nssfTier1Cents + cfg.nssfTier2Cents) > cfg.nssfTier1Cents ? cfg.nssfTier1Cents + cfg.nssfTier2Cents : cfg.nssfTier1Cents;
    const shif = roundMoney((gross * cfg.shifRateBps) / 10000);
    const housing = roundMoney((gross * cfg.housingLevyRateBps) / 10000);
    // sacco loan deduction: one monthly installment approximation (outstanding / remaining term simplified to outstanding/12)
    const loanOut = s.user.memberProfile?.loans?.[0]?.outstandingCents ?? 0;
    const loanDeduction = loanOut > 0 ? Math.round(loanOut / 12) : 0;
    const deductions = { PAYE: payeCents, NSSF: nssf, SHIF: shif, HousingLevy: housing, SaccoLoan: loanDeduction };
    const deductionsTotal = payeCents + nssf + shif + housing + loanDeduction;
    const net = Math.max(0, gross - deductionsTotal);
    await db.payrollEntry.create({
      data: {
        runId: id, staffProfileId: s.id, basicCents: s.basicSalaryCents,
        allowances: { ...allowances, total: allowancesTotal } as any,
        grossCents: gross, deductions: deductions as any, netCents: net,
      },
    });
    totalGross += gross; totalDeductions += deductionsTotal; totalNet += net;
  }
  await db.payrollRun.update({
    where: { id },
    data: { totalGrossCents: totalGross, totalDeductionsCents: totalDeductions, totalNetCents: totalNet },
  });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'PAYROLL_GENERATE', module: 'payroll', entity: 'PayrollRun', entityId: id, after: { entries: staff.length, totalNet }, severity: 'info' });
  return ok({ entries: staff.length, totalGrossCents: totalGross, totalDeductionsCents: totalDeductions, totalNetCents: totalNet, statutory: cfg });
});
