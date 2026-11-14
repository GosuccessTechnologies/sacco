// One-off: correct loan product amount ranges (cents) + demo-mode fixes verification.
import { db } from '../src/lib/db';

async function main() {
  const fixes: Record<string, { minAmountCents: number; maxAmountCents: number }> = {
    DEV: { minAmountCents: 10_000_000, maxAmountCents: 500_000_000 },
    EMER: { minAmountCents: 1_000_000, maxAmountCents: 20_000_000 },
    SCH: { minAmountCents: 2_000_000, maxAmountCents: 50_000_000 },
    BIZ: { minAmountCents: 5_000_000, maxAmountCents: 200_000_000 },
  };
  for (const [code, data] of Object.entries(fixes)) {
    await db.loanProduct.update({ where: { code }, data });
    console.log(`fixed ${code}: KES ${data.minAmountCents / 100} → ${data.maxAmountCents / 100}`);
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
