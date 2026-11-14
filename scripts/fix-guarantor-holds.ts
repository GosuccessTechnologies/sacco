// One-off: correct seeded guarantor holds to sit within exposure caps.
import { db } from '../src/lib/db';

async function main() {
  const app = await db.loanApplication.findFirst({ where: { applicationNumber: { not: '' }, guarantors: { some: { status: 'ACCEPTED' } } }, include: { guarantors: true } });
  if (!app) { console.log('no app found'); process.exit(0); }
  const amount = 4_500_000; // KES 45,000 — within 30% cap of KES 165,000 balances
  for (const g of app.guarantors) {
    if (g.status !== 'ACCEPTED') continue;
    const before = g.guaranteedAmountCents;
    await db.guarantor.update({ where: { id: g.id }, data: { guaranteedAmountCents: amount } });
    const member = await db.memberProfile.findUnique({ where: { id: g.guarantorMemberId }, include: { savingsAccounts: true } });
    const main = member?.savingsAccounts[0];
    if (main) {
      const delta = amount - main.heldFundsCents;
      await db.savingsAccount.update({ where: { id: main.id }, data: { heldFundsCents: amount } });
      console.log(`guarantor ${member?.memberNumber}: hold ${before / 100} → ${amount / 100} KES (delta ${delta / 100})`);
    }
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
