// ============================================================================
// DSMS seed — DEVELOPER_GUIDE.md Appendix B. Run: bun scripts/seed.ts
// SEED_DEMO=false skips demo ledger data (production bootstrap).
// ============================================================================
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/password';
import { DESIGNATION_PERMISSIONS, MEMBER_PERMISSIONS, type Designation } from '../src/lib/constants';
import { postSavingsTransaction } from '../src/lib/savings/service';
import { purchaseShares, persistDividendEntries } from '../src/lib/shares/service';
import { buildSchedule, disburseLoan, postLoanRepayment } from '../src/lib/loans/service';
import { SETTINGS_DEFAULTS } from '../src/lib/settings-defaults';

const SEED_DEMO = process.env.SEED_DEMO !== 'false';
const DEMO_PASSWORD = 'Divine@2026';

async function main() {
  console.log('=== DSMS seed starting ===');
  const t0 = Date.now();

  // ---------------------------------------------------------------- 1. settings
  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
    await db.siteConfig.upsert({
      where: { key },
      create: { key, value: value as any },
      update: {},
    });
  }
  console.log('settings: 9 groups');

  // ---------------------------------------------------------------- 2. RBAC
  for (const [designation, perms] of Object.entries(DESIGNATION_PERMISSIONS) as [Designation, string[]][]) {
    for (const p of perms) {
      await db.permissionAssignment.upsert({
        where: { designation_permissionKey: { designation, permissionKey: p } },
        create: { designation, permissionKey: p }, update: {},
      });
    }
  }
  console.log(`rbac: ${Object.keys(DESIGNATION_PERMISSIONS).length} designations seeded`);

  // ---------------------------------------------------------------- 3. COA
  const coa: [string, string, string, string | null, boolean][] = [
    ['1000', 'Cash at Teller', 'ASSET', null, true],
    ['1010', 'M-Pesa Settlement', 'ASSET', null, true],
    ['1020', 'Bank Accounts', 'ASSET', null, false],
    ['1021', 'Equity Bank — Operations', 'ASSET', '1020', true],
    ['1022', 'KCB Bank — Operations', 'ASSET', '1020', true],
    ['1023', 'Co-op Bank — Operations', 'ASSET', '1020', true],
    ['1030', 'Cheques in Clearing', 'ASSET', null, true],
    ['1100', 'Fixed Assets', 'ASSET', null, false],
    ['1101', 'Furniture & Equipment', 'ASSET', '1100', true],
    ['1102', 'Motor Vehicles', 'ASSET', '1100', true],
    ['1103', 'Accumulated Depreciation', 'ASSET', '1100', true],
    ['1300', 'Loans Portfolio', 'ASSET', null, true],
    ['1400', 'Provision for Bad Debts', 'ASSET', null, true],
    ['2000', 'Liabilities', 'LIABILITY', null, false],
    ['2050', 'Unallocated Funds (Suspense)', 'LIABILITY', null, true],
    ['2100', 'Member Savings Liability', 'LIABILITY', null, true],
    ['2200', 'Statutory Liabilities', 'LIABILITY', null, false],
    ['2210', 'PAYE Payable', 'LIABILITY', '2200', true],
    ['2220', 'NSSF Payable', 'LIABILITY', '2200', true],
    ['2230', 'SHIF Payable', 'LIABILITY', '2200', true],
    ['2240', 'Housing Levy Payable', 'LIABILITY', '2200', true],
    ['2300', 'Expenses Payable', 'LIABILITY', null, true],
    ['2400', 'Bank Overdrafts', 'LIABILITY', null, true],
    ['3000', 'Equity', 'EQUITY', null, false],
    ['3100', 'Share Capital', 'EQUITY', null, true],
    ['3200', 'Retained Earnings', 'EQUITY', null, true],
    ['3300', 'Dividends Payable', 'EQUITY', null, true],
    ['4000', 'Income', 'INCOME', null, false],
    ['4100', 'Fee Income', 'INCOME', null, true],
    ['4110', 'Loan Processing Fee Income', 'INCOME', '4100', true],
    ['4120', 'Insurance Fee Income', 'INCOME', null, true],
    ['4130', 'Loan Interest Income', 'INCOME', null, true],
    ['4140', 'Penalty Income', 'INCOME', null, true],
    ['4150', 'Other Income', 'INCOME', null, true],
    ['4200', 'Investment Income', 'INCOME', null, true],
    ['5000', 'Expenses', 'EXPENSE', null, false],
    ['5100', 'Salaries & Wages', 'EXPENSE', null, true],
    ['5200', 'Dividend Expense', 'EXPENSE', null, true],
    ['5300', 'Write-off Expense', 'EXPENSE', null, true],
    ['5400', 'Interest on Deposits', 'EXPENSE', null, true],
    ['5500', 'Rent', 'EXPENSE', null, true],
    ['5600', 'Utilities', 'EXPENSE', null, true],
    ['5700', 'Office Supplies & Stationery', 'EXPENSE', null, true],
    ['5800', 'Marketing & Advertising', 'EXPENSE', null, true],
    ['5900', 'Bank Charges', 'EXPENSE', null, true],
    ['5950', 'Audit & Professional Fees', 'EXPENSE', null, true],
    ['6900', 'Cash Short / Over', 'EXPENSE', null, true],
  ];
  const codeToId = new Map<string, string>();
  for (const [code, name, type, parentCode, postable] of coa) {
    const parentId = parentCode ? (codeToId.get(parentCode) ?? null) : null;
    const acc = await db.glAccount.upsert({
      where: { code },
      create: { code, name, type, parentId, isPostable: postable },
      update: {},
    });
    codeToId.set(code, acc.id);
  }
  console.log(`coa: ${coa.length} accounts`);

  // ---------------------------------------------------------------- 4. themes (20)
  const themesData: { name: string; description: string; p: string; pf: string; side: string; heading: string; body: string }[] = [
    { name: 'Divine Emerald', description: 'Signature green — trusted, growth-oriented', p: '#0E7C5A', pf: '#0A5C43', side: '#0F241C', heading: 'Playfair Display', body: 'Inter' },
    { name: 'Royal Amethyst', description: 'Regal purple with gold accents', p: '#6D28D9', pf: '#581C87', side: '#2A1B3D', heading: 'Playfair Display', body: 'Inter' },
    { name: 'Ocean Teal', description: 'Calm coastal teal', p: '#0F766E', pf: '#0B5D57', side: '#0B2E2B', heading: 'Sora', body: 'Inter' },
    { name: 'Sunset Coral', description: 'Warm energetic coral', p: '#E2725B', pf: '#C95F4A', side: '#3B1F18', heading: 'Outfit', body: 'Inter' },
    { name: 'Golden Sand', description: 'Premium gold on cream', p: '#B7893F', pf: '#9A6F2F', side: '#2E2617', heading: 'Merriweather', body: 'Inter' },
    { name: 'Forest Pine', description: 'Deep natural green', p: '#2D6A4F', pf: '#1B4332', side: '#12291F', heading: 'Lora', body: 'Karla' },
    { name: 'Ruby Wine', description: 'Rich confident wine red', p: '#8E2C3C', pf: '#6E1F2C', side: '#2A0F14', heading: 'Playfair Display', body: 'Inter' },
    { name: 'Midnight Charcoal', description: 'Executive dark graphite', p: '#37474F', pf: '#263238', side: '#121A1E', heading: 'Space Grotesk', body: 'Inter' },
    { name: 'Copper Bronze', description: 'Metallic warm bronze', p: '#B0653A', pf: '#8F5130', side: '#2B180F', heading: 'Josefin Sans', body: 'Inter' },
    { name: 'Arctic Mint', description: 'Fresh light mint', p: '#5FB8A0', pf: '#4A9E88', side: '#173730', heading: 'Manrope', body: 'Inter' },
    { name: 'Lavender Haze', description: 'Soft professional lavender', p: '#8B7BD8', pf: '#7061B8', side: '#221E3A', heading: 'Poppins', body: 'Inter' },
    { name: 'Tangerine Zest', description: 'Vibrant citrus energy', p: '#F07B3F', pf: '#D3661F', side: '#331B0A', heading: 'Rubik', body: 'Inter' },
    { name: 'Rose Quartz', description: 'Gentle premium pink', p: '#C97B99', pf: '#A9637E', side: '#361E29', heading: 'Karla', body: 'Inter' },
    { name: 'Jungle Canopy', description: 'Tropical dense green', p: '#3E7C59', pf: '#2F5F44', side: '#152B1F', heading: 'Mulish', body: 'Inter' },
    { name: 'Sandy Dune', description: 'Earthy warm neutrals', p: '#B08A5E', pf: '#96744E', side: '#2C2318', heading: 'Work Sans', body: 'Inter' },
    { name: 'Plum Velvet', description: 'Luxurious deep plum', p: '#6E4585', pf: '#58366C', side: '#231730', heading: 'DM Sans', body: 'Inter' },
    { name: 'Steel Graphite', description: 'Neutral engineering gray', p: '#52606D', pf: '#3E4C59', side: '#1C2430', heading: 'Fira Sans', body: 'Inter' },
    { name: 'Sunrise Amber', description: 'Bright optimistic amber', p: '#D97706', pf: '#B45309', side: '#33210A', heading: 'Plus Jakarta Sans', body: 'Inter' },
    { name: 'Aqua Lagoon', description: 'Clear tropical water', p: '#129C9E', pf: '#0E7F81', side: '#0F2A2B', heading: 'Urbanist', body: 'Inter' },
    { name: 'Berry Crush', description: 'Bold fruity statement', p: '#B4366E', pf: '#932A59', side: '#2E1120', heading: 'Epilogue', body: 'Inter' },
  ];
  for (const t of themesData) {
    const tokens = makeThemeTokens(t.p, t.pf, t.side, t.heading, t.body);
    const existing = await db.theme.findUnique({ where: { name: t.name } });
    if (existing) { await db.theme.update({ where: { id: existing.id }, data: { tokens } }); }
    else await db.theme.create({ data: { name: t.name, description: t.description, tokens, system: true, active: t.name === 'Divine Emerald' } });
  }
  // exactly one active
  const activeCount = await db.theme.count({ where: { active: true } });
  if (activeCount === 0) await db.theme.update({ where: { name: 'Divine Emerald' }, data: { active: true } });
  console.log('themes: 20 seeded (Divine Emerald active)');

  // ---------------------------------------------------------------- 5. letterheads (20)
  const lhLayouts = ['centered', 'split', 'band', 'minimal', 'watermark', 'ribbon', 'boxed', 'gradient', 'sidebar', 'duotone'] as const;
  let lhIdx = 0;
  for (const layout of lhLayouts) {
    for (const variant of [1, 2]) {
      const name = `${layout.charAt(0).toUpperCase()}${layout.slice(1)} ${variant === 1 ? 'Classic' : 'Accent'}`;
      const design = {
        headerLayout: layout,
        showLogo: true, logoSize: 44,
        titleCase: 'uppercase',
        contactLayout: variant === 1 ? 'stacked' : 'inline',
        ruleStyle: variant === 1 ? 'solid' : 'dashed',
        accentSource: 'theme',
        footerNote: variant === 1 ? 'Serving members with integrity' : 'Growing Together, Prospering Together',
        pattern: variant === 1 ? 'none' : 'dots',
      };
      const existing = await db.letterhead.findUnique({ where: { name } });
      if (!existing) await db.letterhead.create({ data: { name, design, system: true, active: name === 'Centered Classic' } });
      lhIdx++;
    }
  }
  if ((await db.letterhead.count({ where: { active: true } })) === 0) {
    await db.letterhead.update({ where: { name: 'Centered Classic' }, data: { active: true } });
  }
  console.log('letterheads: 20 seeded (Centered Classic active)');

  // ---------------------------------------------------------------- 6. users
  const usersSeed: { email: string; name: string; role: string; designation?: string; phone: string }[] = [
    { email: 'admin@divinesacco.co.ke', name: 'System Administrator', role: 'SUPER_ADMIN', phone: '+254700000001' },
    { email: 'manager@divinesacco.co.ke', name: 'Jane Mwangi (Manager)', role: 'ADMIN', designation: 'MANAGER', phone: '+254700000002' },
    { email: 'teller@divinesacco.co.ke', name: 'Peter Otieno (Teller)', role: 'ADMIN', designation: 'TELLER', phone: '+254700000003' },
    { email: 'loans@divinesacco.co.ke', name: 'Mary Achieng (Loans)', role: 'ADMIN', designation: 'LOAN_OFFICER', phone: '+254700000004' },
    { email: 'accounts@divinesacco.co.ke', name: 'David Kamau (Accounts)', role: 'ADMIN', designation: 'ACCOUNTANT', phone: '+254700000005' },
    { email: 'compliance@divinesacco.co.ke', name: 'Esther Njeri (Compliance)', role: 'ADMIN', designation: 'COMPLIANCE', phone: '+254700000006' },
    { email: 'reception@divinesacco.co.ke', name: 'Sam Kariuki (Reception)', role: 'ADMIN', designation: 'RECEPTION', phone: '+254700000007' },
  ];
  for (const u of usersSeed) {
    await db.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email, phone: u.phone, name: u.name, role: u.role, designation: u.designation ?? null,
        passwordHash: hashPassword(DEMO_PASSWORD), status: 'ACTIVE',
      },
      update: {},
    });
  }
  console.log('users: super admin + 6 staff');

  // ---------------------------------------------------------------- 7. products
  const savingsProducts: { code: string; name: string; description: string; type: string; isDefault?: boolean; rate?: number; minBal?: number; policy?: string; lockIn?: number; sort: number }[] = [
    { code: 'MAIN', name: 'Main Savings', description: 'The compulsory monthly contribution account every member holds.', type: 'REGULAR', isDefault: true, rate: 300, minBal: 50_000, policy: 'FREE', sort: 1 },
    { code: 'FIXED12', name: 'Fixed Deposit (12 months)', description: 'Locked savings with the highest interest, paid at maturity.', type: 'FIXED', rate: 800, minBal: 500_000, policy: 'LOCKED_UNTIL_MATURITY', lockIn: 12, sort: 2 },
    { code: 'HOLIDAY', name: 'Holiday Account', description: 'Save through the year for your December holiday.', type: 'HOLIDAY', rate: 400, minBal: 10_000, policy: 'PENALTY', sort: 3 },
    { code: 'XMAS', name: 'Christmas Account', description: 'Dedicated Christmas savings club with bonus interest.', type: 'CHRISTMAS', rate: 500, minBal: 10_000, policy: 'APPROVAL_REQUIRED', sort: 4 },
    { code: 'JUNIOR', name: 'Junior Account', description: 'Build your child\u2019s future — operated by the parent until 18.', type: 'JUNIOR', rate: 350, minBal: 5_000, policy: 'FREE', sort: 5 },
    { code: 'TARGET', name: 'Target Savings', description: 'Set a goal, track progress, hit it faster.', type: 'TARGET', rate: 250, minBal: 0, policy: 'FREE', sort: 6 },
  ];
  for (const p of savingsProducts) {
    await db.savingsProduct.upsert({
      where: { code: p.code },
      create: {
        code: p.code, name: p.name, description: p.description, type: p.type, isDefault: Boolean(p.isDefault),
        interestRateBps: p.rate ?? 0, minBalanceCents: p.minBal ?? 0,
        withdrawalPolicy: p.policy ?? 'FREE', lockInMonths: p.lockIn ?? 0,
        minOpeningCents: p.minBal ?? 0, sortOrder: p.sort, isPublic: true,
      },
      update: {},
    });
  }
  const loanProducts = [
    { code: 'DEV', name: 'Development Loan', description: 'Long-term asset financing up to 3x savings.', method: 'REDUCING', rate: 1200, min: 10_000_000, max: 500_000_000, tmin: 6, tmax: 48, mult: 3, guar: 3, sort: 1 },
    { code: 'EMER', name: 'Emergency Loan', description: 'Same-day processing for urgent needs.', method: 'FLAT', rate: 600, min: 1_000_000, max: 20_000_000, tmin: 1, tmax: 12, mult: 1, guar: 1, sort: 2 },
    { code: 'SCH', name: 'School Fees Loan', description: 'Term-time education financing.', method: 'REDUCING', rate: 900, min: 2_000_000, max: 50_000_000, tmin: 3, tmax: 24, mult: 2, guar: 2, sort: 3 },
    { code: 'BIZ', name: 'Business Booster', description: 'Working capital for member businesses.', method: 'REDUCING', rate: 1400, min: 5_000_000, max: 200_000_000, tmin: 6, tmax: 36, mult: 3, guar: 3, sort: 4 },
  ];
  for (const p of loanProducts) {
    await db.loanProduct.upsert({
      where: { code: p.code },
      create: {
        code: p.code, name: p.name, description: p.description, interestMethod: p.method,
        interestRateBps: p.rate, minAmountCents: p.min, maxAmountCents: p.max,
        termMinMonths: p.tmin, termMaxMonths: p.tmax, savingsMultiplier: p.mult,
        requiredGuarantors: p.guar, sortOrder: p.sort, isPublic: true,
        securityOptions: ['SHARES', 'SALARY', 'LOGBOOK', 'TITLE_DEED'],
      },
      update: {},
    });
  }
  console.log('products: 6 savings + 4 loan');

  // ---------------------------------------------------------------- 8. templates
  const templates: { code: string; channel: 'EMAIL' | 'SMS'; subject: string; body: string; category: string }[] = [
    tpl('application_received', 'EMAIL', 'We received your membership application', '<p>Dear {{name}},</p><p>Thank you for applying to join {{entity}}. Your application <strong>{{applicationNumber}}</strong> was received and is under review. We will contact you within 2 working days.</p><p>{{tagline}}</p>', 'MEMBER'),
    tpl('application_received', 'SMS', '', 'Hi {{name}}, your {{entity}} membership application {{applicationNumber}} was received and is under review.', 'MEMBER'),
    tpl('application_approved', 'EMAIL', 'Welcome to {{entity}}!', '<p>Dear {{name}},</p><p>Your membership is approved! Your member number is <strong>{{memberNumber}}</strong>.</p><p>Portal login: <strong>{{email}}</strong> with the temporary password <strong>{{tempPassword}}</strong> (you will be asked to change it at first login). Install our member app from the portal dashboard.</p>', 'MEMBER'),
    tpl('application_approved', 'SMS', '', 'Welcome to {{entity}}, {{name}}! Member No: {{memberNumber}}. Portal: {{email}} / temp password {{tempPassword}}', 'MEMBER'),
    tpl('application_rejected', 'EMAIL', 'Update on your membership application', '<p>Dear {{name}},</p><p>After careful review, your application {{applicationNumber}} was not successful at this time.</p><p><em>Reason:</em> {{reason}}</p><p>You are welcome to re-apply in future.</p>', 'MEMBER'),
    tpl('application_rejected', 'SMS', '', 'Hi {{name}}, your {{entity}} application {{applicationNumber}} was not successful. Reason: {{reason}}', 'MEMBER'),
    tpl('member_welcome', 'EMAIL', 'Welcome to the {{entity}} family', '<p>Dear {{name}},</p><p>We are delighted to have you. Your journey to <strong>{{tagline}}</strong> starts now.</p><p>Member No: <strong>{{memberNumber}}</strong></p>', 'MEMBER'),
    tpl('member_welcome', 'SMS', '', 'Welcome to {{entity}}, {{name}}! Member No {{memberNumber}}. {{tagline}}', 'MEMBER'),
    tpl('loan_received', 'EMAIL', 'Loan application {{applicationNumber}} received', '<p>Dear {{name}},</p><p>Your {{productName}} application of <strong>{{amount}}</strong> for {{term}} months was received and is at the guarantor stage.</p>', 'LOAN'),
    tpl('loan_received', 'SMS', '', '{{name}}, your {{entity}} loan application {{applicationNumber}} ({{amount}}) was received.', 'LOAN'),
    tpl('loan_guarantor_request', 'EMAIL', 'Guarantor request from {{applicantName}}', '<p>Hello {{name}},</p><p>{{applicantName}} ({{memberNumber2}}) has requested you to guarantee their loan of <strong>{{amount}}</strong> for up to <strong>{{guaranteeAmount}}</strong>.</p><p>Open your member portal to accept or decline. This request expires in 7 days.</p>', 'LOAN'),
    tpl('loan_guarantor_request', 'SMS', '', 'Hi {{name}}, {{applicantName}} needs you to guarantee {{amount}} (your share {{guaranteeAmount}}). Respond in your {{entity}} portal within 7 days.', 'LOAN'),
    tpl('loan_approved', 'EMAIL', 'Your loan has been approved', '<p>Dear {{name}},</p><p>Congratulations! Your {{productName}} of <strong>{{amount}}</strong> is approved and will be disbursed shortly.</p>', 'LOAN'),
    tpl('loan_approved', 'SMS', '', 'Good news {{name}}! Your {{entity}} loan of {{amount}} was approved.', 'LOAN'),
    tpl('loan_rejected', 'EMAIL', 'Loan application outcome', '<p>Dear {{name}},</p><p>Your loan application {{applicationNumber}} was not approved.</p><p><em>Reason:</em> {{reason}}</p>', 'LOAN'),
    tpl('loan_rejected', 'SMS', '', '{{name}}, your {{entity}} loan {{applicationNumber}} was not approved. Reason: {{reason}}', 'LOAN'),
    tpl('loan_disbursed', 'EMAIL', 'Loan disbursed — {{loanNumber}}', '<p>Dear {{name}},</p><p><strong>{{amount}}</strong> has been disbursed to you via {{channel}} (ref {{ref}}).</p><p>First installment of <strong>{{installment}}</strong> is due on {{dueDate}}. Your full schedule is in the portal.</p>', 'LOAN'),
    tpl('loan_disbursed', 'SMS', '', '{{name}}, {{amount}} disbursed ({{loanNumber}}) via {{channel}}. First installment {{installment}} due {{dueDate}}.', 'LOAN'),
    tpl('repayment_due', 'EMAIL', 'Installment reminder — due {{dueDate}}', '<p>Dear {{name}},</p><p>This is a reminder that your installment of <strong>{{amount}}</strong> for loan {{loanNumber}} is due on {{dueDate}}.</p><p>Pay via M-Pesa paybill or from your savings in the portal.</p>', 'LOAN'),
    tpl('repayment_due', 'SMS', '', 'Reminder {{name}}: {{amount}} due {{dueDate}} for loan {{loanNumber}}. Pay via M-Pesa or portal.', 'LOAN'),
    tpl('repayment_receipt', 'EMAIL', 'Payment received — thank you', '<p>Dear {{name}},</p><p>We have received <strong>{{amount}}</strong> towards loan {{loanNumber}}. Outstanding is now <strong>{{outstanding}}</strong>.</p>', 'LOAN'),
    tpl('repayment_receipt', 'SMS', '', 'Received {{amount}} for loan {{loanNumber}}. Outstanding {{outstanding}}. Thank you {{name}}.', 'LOAN'),
    tpl('penalty_accrued', 'EMAIL', 'Late payment notice — {{loanNumber}}', '<p>Dear {{name}},</p><p>Your loan {{loanNumber}} is {{days}} days in arrears. Penalties of <strong>{{penalty}}</strong> have accrued. Kindly regularize to avoid further charges.</p>', 'LOAN'),
    tpl('penalty_accrued', 'SMS', '', '{{name}}, loan {{loanNumber}} is {{days}} days late. Penalty {{penalty}} accrued. Please pay to avoid more charges.', 'LOAN'),
    tpl('savings_deposit_alert', 'EMAIL', 'Deposit confirmed', '<p>Dear {{name}},</p><p>A deposit of <strong>{{amount}}</strong> was made to {{accountNumber}} via {{channel}}. New balance: <strong>{{balance}}</strong>.</p>', 'SAVING'),
    tpl('savings_deposit_alert', 'SMS', '', '{{name}}, deposit {{amount}} to {{accountNumber}} ({{channel}}). Balance {{balance}}.', 'SAVING'),
    tpl('savings_withdrawal_alert', 'EMAIL', 'Withdrawal processed', '<p>Dear {{name}},</p><p>A withdrawal of <strong>{{amount}}</strong> from {{accountNumber}} via {{channel}}. New balance: <strong>{{balance}}</strong>.</p>', 'SAVING'),
    tpl('savings_withdrawal_alert', 'SMS', '', '{{name}}, withdrawal {{amount}} from {{accountNumber}}. Balance {{balance}}.', 'SAVING'),
    tpl('standing_order_failed', 'EMAIL', 'Standing order could not run', '<p>Dear {{name}},</p><p>Your standing order of {{amount}} could not run due to insufficient balance.</p>', 'SAVING'),
    tpl('standing_order_failed', 'SMS', '', '{{name}}, your standing order of {{amount}} failed (low balance).', 'SAVING'),
    tpl('dividend_announced', 'EMAIL', 'Dividend for {{year}} announced', '<p>Dear {{name}},</p><p>The board has declared a dividend for {{year}}. Your total payout is <strong>{{payout}}</strong> (shares {{sharesDividend}} + deposit interest {{depositInterest}}).</p>', 'DIVIDEND'),
    tpl('dividend_announced', 'SMS', '', '{{name}}, {{entity}} dividend {{year}}: your payout {{payout}}. Details in portal.', 'DIVIDEND'),
    tpl('dividend_paid', 'EMAIL', 'Dividend paid', '<p>Dear {{name}},</p><p>Your dividend of <strong>{{payout}}</strong> has been credited ({{channel}}).</p>', 'DIVIDEND'),
    tpl('dividend_paid', 'SMS', '', '{{name}}, dividend {{payout}} paid via {{channel}}. Thank you for growing with us.', 'DIVIDEND'),
    tpl('meeting_notice', 'EMAIL', '{{meetingTitle}}', '<p>Dear {{name}},</p><p>{{meetingTitle}}</p><p>{{meetingDetails}}</p>', 'MEETING'),
    tpl('meeting_notice', 'SMS', '', '{{name}}: {{meetingTitle}} — {{meetingDetails}}', 'MEETING'),
    tpl('otp_code', 'EMAIL', 'Your verification code', '<p>Your code is <strong>{{code}}</strong>. It expires in 5 minutes. Never share it.</p>', 'OTP'),
    tpl('otp_code', 'SMS', '', 'Your {{entity}} code: {{code}} (expires 5 min). Never share it.', 'OTP'),
    tpl('password_reset', 'EMAIL', 'Password reset', '<p>Dear {{name}},</p><p>Your temporary password is <strong>{{tempPassword}}</strong>. You must change it at next login.</p>', 'SECURITY'),
    tpl('password_reset', 'SMS', '', '{{name}}, temp password issued for your {{entity}} account. Change it at login.', 'SECURITY'),
    tpl('account_suspended', 'EMAIL', 'Account notice', '<p>Dear {{name}},</p><p>Your membership is currently {{status}}. Contact the office for details.</p>', 'SECURITY'),
    tpl('account_suspended', 'SMS', '', '{{name}}, your {{entity}} membership is {{status}}. Contact the office.', 'SECURITY'),
    tpl('statement_ready', 'EMAIL', 'Your statement is ready', '<p>Dear {{name}},</p><p>Your statement for {{period}} is ready. Download it from your portal.</p>', 'SAVING'),
    tpl('statement_ready', 'SMS', '', '{{name}}, your statement {{period}} is ready in your portal.', 'SAVING'),
  ];
  for (const t of templates) {
    await db.messageTemplate.upsert({
      where: { code_channel: { code: t.code, channel: t.channel } as any },
      create: { code: t.code, channel: t.channel, subject: t.subject, body: t.body, category: t.category },
      update: { subject: t.subject, body: t.body },
    });
  }
  console.log(`templates: ${templates.length} rows (email + sms)`);

  // ---------------------------------------------------------------- 9. page content
  const pages: { section: string; title: string; subtitle?: string; body?: string; sort: number; cta?: [string, string] }[] = [
    { section: 'hero', title: 'Grow Your Money With People You Trust', subtitle: 'Divine Sacco Society Ltd', body: 'Save conveniently, borrow affordably, and earn annual dividends — all in one member-owned platform. Join hundreds of members growing together.', sort: 1, cta: ['Become a Member', '/apply'] },
    { section: 'about', title: 'Who We Are', subtitle: 'A member-owned financial co-operative', body: 'Divine Sacco is a licensed co-operative society serving members with savings, affordable credit, share ownership and annual dividends. We exist to grow the financial dignity of every member — Growing Together, Prospering Together.', sort: 2 },
    { section: 'why', title: 'Why Members Choose Us', subtitle: 'Built for members, by members', body: 'Affordable interest from 6% reducing;|Dividends & interest on deposits every year;|Loans up to 3x your savings;|M-Pesa deposits, repayments and alerts;|Free member app (installable PWA);|Regulated & audited annually.', sort: 3 },
    { section: 'testimonials', title: 'Members Say It Best', subtitle: 'Real stories from the co-operative', body: 'My shop grew from a kiosk to a stocked store thanks to two Development Loans. The M-Pesa repayments make it painless.;|The Christmas Account changed our Decembers. We shop without borrowing.;|As a teacher, the School Fees Loan timing is perfect every term.', sort: 6 },
    { section: 'cta', title: 'Ready to grow with us?', subtitle: 'Apply in 5 minutes', body: 'Fill the online application, attach your ID details, and our team will contact you within two working days.', sort: 8, cta: ['Apply Now', '/apply'] },
    { section: 'media', title: 'See Us In Action', subtitle: 'From our channels', body: 'Follow our channels for member education, AGM highlights and product launches.', sort: 7 },
  ];
  for (const p of pages) {
    const existing = await db.pageContent.findFirst({ where: { page: 'home', section: p.section } });
    if (existing) {
      await db.pageContent.update({
        where: { id: existing.id },
        data: { title: p.title, subtitle: p.subtitle ?? null, body: p.body ?? null, sortOrder: p.sort, ctaLabel: p.cta?.[0] ?? null, ctaHref: p.cta?.[1] ?? null },
      });
    } else {
      await db.pageContent.create({
        data: { page: 'home', section: p.section, title: p.title, subtitle: p.subtitle ?? null, body: p.body ?? null, sortOrder: p.sort, ctaLabel: p.cta?.[0] ?? null, ctaHref: p.cta?.[1] ?? null },
      });
    }
  }
  console.log('page content: landing sections');

  // ---------------------------------------------------------------- 10. demo data
  if (!SEED_DEMO) {
    console.log('SEED_DEMO=false — skipping demo data');
  } else {
    await seedDemo();
  }

  // ---------------------------------------------------------------- done
  console.log(`=== seed complete in ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
  console.log('--- LOGIN CREDENTIALS (demo) ---');
  console.log(`SUPER ADMIN : admin@divinesacco.co.ke / ${DEMO_PASSWORD}`);
  console.log('STAFF       : manager|teller|loans|accounts|compliance|reception @divinesacco.co.ke / ' + DEMO_PASSWORD);
  if (SEED_DEMO) console.log('MEMBERS     : member1|member2|member3 @divinesacco.co.ke / ' + DEMO_PASSWORD);
}

// ============================================================================
function tpl(code: string, channel: 'EMAIL' | 'SMS', subject: string, body: string, category: string) {
  return { code, channel, subject: subject || (channel === 'SMS' ? '' : code), body, category };
}

function makeThemeTokens(primary: string, primaryFg: string, sidebar: string, heading: string, body: string) {
  const light = {
    colors: {
      primary, primaryFg: '#FFFFFF',
      accent: '#F2B33C', accentFg: '#23180A',
      bg: '#F7F9F8', surface: '#FFFFFF',
      text: '#1B2420', mutedText: '#5C6B63',
      border: '#DCE5DF',
      sidebar, sidebarText: '#D7E7DE',
      header: '#FFFFFF', headerText: '#1B2420',
      footer: sidebar, footerText: '#CFE2D8',
      cardHero: `linear-gradient(135deg,${primary} 0%,${primaryFg} 100%)`, cardHeroFg: '#FFFFFF',
      tableHeaderA: '#EDF4F0', tableHeaderB: '#E2EDE7',
      zebra: '#F3F8F5',
      danger: '#C0392B', warning: '#B7791F', success: '#1E8E5A', info: '#2C7A7B',
    },
    fonts: { heading, body, headingWeight: 700, scale: 1 },
    heading: { case: 'none', letterSpacing: '-0.01em', transform: 'none' },
    radius: '0.75rem',
    backgrounds: { bodyPattern: 'none' },
    divider: { style: 'solid', color: 'var(--t-border)', thickness: '1px' },
    scrollbar: { thumb: primary, track: '#EDF3F0', width: '10px', radius: '8px' },
    layout: { sidebarStyle: 'dark-panel', headerStyle: 'clean' },
  };
  const dark = JSON.parse(JSON.stringify({
    ...light,
    colors: {
      ...light.colors,
      bg: '#101613', surface: '#1A231E', text: '#E8F0EC', mutedText: '#9FB4AB', border: '#2A3A33',
      header: '#151D19', headerText: '#E8F0EC',
      tableHeaderA: '#1D2823', tableHeaderB: '#22302A', zebra: '#161F1A',
      accent: '#F2B33C',
    },
    scrollbar: { ...light.scrollbar, track: '#1A231E' },
  }));
  return { ...light, dark };
}

// ============================================================================
const DEMO_IDS = ['28453917', '31880422', '35201155'];
const DEMO_EMAILS = ['member1@divinesacco.co.ke', 'member2@divinesacco.co.ke', 'member3@divinesacco.co.ke'];

async function wipeDemo() {
  const profiles = await db.memberProfile.findMany({ where: { nationalId: { in: DEMO_IDS } } });
  if (!profiles.length && !(await db.subscriber.findFirst({ where: { email: 'visitor1@example.com' } }))) return;
  console.log('wipeDemo: removing previous demo data…');
  for (const p of profiles) {
    await db.guarantor.deleteMany({ where: { OR: [{ guarantorMemberId: p.id }, { application: { memberProfileId: p.id } }] } });
    const loans = await db.loan.findMany({ where: { memberProfileId: p.id }, select: { id: true } });
    for (const l of loans) {
      await db.loanRepayment.deleteMany({ where: { loanId: l.id } });
      await db.loanAction.deleteMany({ where: { loanId: l.id } });
    }
    await db.repaymentSchedule.deleteMany({ where: { loan: { memberProfileId: p.id } } });
    await db.loan.deleteMany({ where: { memberProfileId: p.id } });
    await db.loanApplication.deleteMany({ where: { memberProfileId: p.id } });
    await db.savingsTransaction.deleteMany({ where: { memberProfileId: p.id } });
    await db.savingsAccount.deleteMany({ where: { memberProfileId: p.id } });
    await db.standingOrder.deleteMany({ where: { memberProfileId: p.id } });
    await db.shareTransaction.deleteMany({ where: { memberProfileId: p.id } });
    await db.memberSharePosition.deleteMany({ where: { memberProfileId: p.id } });
    await db.dividendEntry.deleteMany({ where: { memberProfileId: p.id } });
    await db.tellerTransaction.deleteMany({ where: { memberProfileId: p.id } });
    await db.paymentTransaction.deleteMany({ where: { memberProfileId: p.id } });
    await db.nextOfKin.deleteMany({ where: { memberProfileId: p.id } });
    await db.beneficiary.deleteMany({ where: { memberProfileId: p.id } });
    await db.memberProfile.delete({ where: { id: p.id } });
    await db.user.deleteMany({ where: { email: { in: DEMO_EMAILS }, memberProfile: null } });
  }
  await db.dividendEntry.deleteMany({});
  await db.dividendRun.deleteMany({});
  await db.subscriber.deleteMany({ where: { email: 'visitor1@example.com' } });
  await db.subscriber.deleteMany({ where: { phone: '+254722000111' } });
  await db.vendor.deleteMany({ where: { name: 'Nairobi Water' } });
  await db.expense.deleteMany({ where: { description: 'Office water bill' } });
  await db.bankAccount.deleteMany({ where: { name: { in: ['Operations — Equity', 'Operations — KCB'] } } });
  await db.payrollRun.deleteMany({ where: { status: 'DRAFT' } });
}

async function seedDemo() {
  await wipeDemo();
  const demoMembers: { email: string; first: string; last: string; idNo: string; phone: string; occupation: string }[] = [
    { email: 'member1@divinesacco.co.ke', first: 'Grace', last: 'Wanjiru', idNo: '28453917', phone: '+254711000111', occupation: 'Trader' },
    { email: 'member2@divinesacco.co.ke', first: 'Joseph', last: 'Barasa', idNo: '31880422', phone: '+254711000222', occupation: 'Teacher' },
    { email: 'member3@divinesacco.co.ke', first: 'Aisha', last: 'Hassan', idNo: '35201155', phone: '+254711000333', occupation: 'Caterer' },
  ];
  const main = await db.savingsProduct.findUnique({ where: { code: 'MAIN' } })!;
  const dev = await db.loanProduct.findUnique({ where: { code: 'DEV' } })!;
  const emer = await db.loanProduct.findUnique({ where: { code: 'EMER' } })!;
  const users: Record<string, string> = {};

  for (const m of demoMembers) {
    const user = await db.user.upsert({
      where: { email: m.email },
      create: { email: m.email, phone: m.phone, name: `${m.first} ${m.last}`, role: 'MEMBER', passwordHash: hashPassword(DEMO_PASSWORD), status: 'ACTIVE' },
      update: {},
    });
    const memberNumber = await nextDemoSeq('member');
    const profile = await db.memberProfile.create({
      data: {
        userId: user.id, memberNumber,
        firstName: m.first, lastName: m.last, gender: m.first === 'Joseph' ? 'MALE' : 'FEMALE',
        dateOfBirth: new Date(1990, 5, 15), nationalId: m.idNo,
        phone: m.phone, email: m.email, physicalAddress: 'Kenyatta Avenue', town: 'Nairobi', county: 'Nairobi',
        occupation: m.occupation, employerName: 'Self', monthlyIncomeCents: 450_000_00,
        status: 'ACTIVE', kycVerified: true, kycVerifiedAt: new Date(), joinedAt: new Date(Date.now() - 400 * 86400000),
      },
    });
    await db.memberSharePosition.create({ data: { memberProfileId: profile.id, totalShares: 300, totalValueCents: 300 * 500_00 } });
    await db.nextOfKin.create({
      data: { memberProfileId: profile.id, name: `${m.first} Kin`, relationship: 'Sibling', phone: m.phone, percentage: 100 },
    });

    // main savings account with history through the REAL engine
    const account = await db.savingsAccount.create({
      data: { accountNumber: await nextDemoSeq('savings'), memberProfileId: profile.id, productId: main.id, status: 'OPEN', openedAt: new Date(Date.now() - 390 * 86400000) },
    });
    const deposits = [80_000_00, 60_000_00, 45_000_00];
    for (let i = 0; i < deposits.length; i++) {
      await postSavingsTransaction({
        accountId: account.id, type: 'DEPOSIT', channel: 'COUNTER',
        amountCents: deposits[i], valueDate: new Date(Date.now() - (60 - i * 20) * 86400000),
        narration: 'Monthly contribution', performedById: null,
      });
    }
    // a withdrawal
    await postSavingsTransaction({
      accountId: account.id, type: 'WITHDRAWAL', channel: 'COUNTER',
      amountCents: 20_000_00, valueDate: new Date(Date.now() - 10 * 86400000),
      narration: 'Counter withdrawal', performedById: null,
    });
  }

  // members 1&2 guarantee member 3's loan; member1 gets an active loan (member2 in arrear shape)
  const all = await db.memberProfile.findMany({ include: { savingsAccounts: true } });
  const [m1, m2, m3] = all;

  // ---- loan for member1 (DISBURSED, one repayment made)
  const app1 = await db.loanApplication.create({
    data: {
      applicationNumber: await nextDemoSeq('loanApp'), memberProfileId: m1.id, productId: dev.id,
      requestedAmountCents: 1_500_000_00, approvedAmountCents: 1_500_000_00, termMonths: 12,
      purpose: 'Business expansion', requestedBy: 'MEMBER', status: 'APPROVED',
      approvalTrail: [{ role: 'LOAN_OFFICER', decision: 'APPROVED', at: new Date().toISOString() }, { role: 'MANAGER', decision: 'APPROVED', at: new Date().toISOString() }],
      appliedAt: new Date(Date.now() - 40 * 86400000),
    },
  });
  await db.guarantor.create({ data: { applicationId: app1.id, guarantorMemberId: m2.id, guaranteedAmountCents: 4_500_000, status: 'ACCEPTED', method: 'PORTAL_LINK', respondedAt: new Date(), expiresAt: new Date(Date.now() + 5 * 86400000) } });
  await db.guarantor.create({ data: { applicationId: app1.id, guarantorMemberId: m3.id, guaranteedAmountCents: 4_500_000, status: 'ACCEPTED', method: 'PORTAL_LINK', respondedAt: new Date(), expiresAt: new Date(Date.now() + 5 * 86400000) } });
  const loan1 = await disburseLoan({ applicationId: app1.id, channel: 'BANK', channelRef: 'BK-88231', performedById: (await db.user.findUnique({ where: { email: 'manager@divinesacco.co.ke' } }))!.id });
  await postLoanRepayment({ loanId: loan1.loanId, amountCents: Math.round(loan1.schedule[0].totalDueCents), channel: 'COUNTER', externalRef: 'CASH-00101', receivedById: null, narration: 'First installment' });

  // ---- application for member2 in GUARANTOR_PENDING (pending guarantee from member1)
  const app2 = await db.loanApplication.create({
    data: {
      applicationNumber: await nextDemoSeq('loanApp'), memberProfileId: m2.id, productId: emer.id,
      requestedAmountCents: 150_000_00, termMonths: 6, purpose: 'Medical',
      requestedBy: 'ADMIN_ON_BEHALF', submittedById: (await db.user.findUnique({ where: { email: 'loans@divinesacco.co.ke' } }))!.id,
      status: 'GUARANTOR_PENDING', appliedAt: new Date(Date.now() - 2 * 86400000),
    },
  });
  await db.guarantor.create({ data: { applicationId: app2.id, guarantorMemberId: m1.id, guaranteedAmountCents: 40_000_00, status: 'PENDING', expiresAt: new Date(Date.now() + 5 * 86400000) } });

  // ---- shares purchase demo (member3 via counter)
  await purchaseShares({ memberProfileId: m3.id, quantity: 50, channel: 'COUNTER', narration: 'Counter share purchase', performedById: null });

  // ---- dividend run DRAFT→CALCULATED
  const run = await db.dividendRun.create({
    data: { year: new Date().getFullYear() - 1, method: 'HYBRID', totalPoolCents: 2_000_000_00, depositInterestBps: 300, status: 'DRAFT' },
  });
  await persistDividendEntries(run.id);

  // ---- subscribers & payments & expenses & vendors
  await db.subscriber.createMany({
    data: [
      { name: 'Visitor One', email: 'visitor1@example.com', source: 'WEB_FOOTER' },
      { name: 'Visitor Two', phone: '+254722000111', source: 'WEB_FOOTER' },
    ],
  });
  for (const prov of ['MPESA_DARAJA', 'PESAPAL', 'SMTP', 'SMS_GATEWAY'] as const) {
    await db.integrationCredential.upsert({
      where: { provider: prov },
      create: { provider: prov, status: 'PENDING', demoMode: true, environment: prov === 'SOCIAL' ? 'PRODUCTION' : 'SANDBOX' },
      update: {},
    });
  }
  await db.integrationCredential.upsert({
    where: { provider: 'SOCIAL' },
    create: { provider: 'SOCIAL', status: 'CONNECTED', config: null as any, environment: 'PRODUCTION' },
    update: {},
  });
  const vendor = await db.vendor.create({ data: { name: 'Nairobi Water', category: 'Utilities', phone: '+254700111222' } });
  const util = await db.glAccount.findUnique({ where: { code: '5600' } })!;
  await db.expense.create({
    data: { vendorId: vendor.id, glAccountId: util.id, description: 'Office water bill', amountCents: 45_000_00, billDate: new Date(), dueDate: new Date(Date.now() + 14 * 86400000), status: 'APPROVED' },
  });
  await db.bankAccount.createMany({
    data: [
      { name: 'Operations — Equity', bankName: 'Equity Bank', accountNumber: '0123456789', glAccountId: (await db.glAccount.findUnique({ where: { code: '1021' } }))!.id, openingBalanceCents: 15_000_000_00 },
      { name: 'Operations — KCB', bankName: 'KCB Bank', accountNumber: '9876543210', glAccountId: (await db.glAccount.findUnique({ where: { code: '1022' } }))!.id, openingBalanceCents: 8_000_000_00 },
    ],
  });
  // staff profiles + HR demo
  const staffUsers = await db.user.findMany({ where: { role: 'ADMIN' } });
  let sn = 0;
  for (const su of staffUsers) {
    sn++;
    await db.staffProfile.upsert({
      where: { userId: su.id },
      create: {
        userId: su.id, staffNo: `STF-${String(sn).padStart(4, '0')}`, designation: su.designation ?? 'MANAGER',
        department: su.designation, employmentDate: new Date(Date.now() - 700 * 86400000),
        basicSalaryCents: 70_000_00, grossSalaryCents: 85_000_00,
        allowances: { house: 10_000_00, transport: 5_000_00 },
      },
      update: {},
    });
  }
  await db.payrollRun.create({ data: { period: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`, status: 'DRAFT' } });
  console.log('demo data: members, savings, loans, shares, dividends, hr — done');
}

let demoSeq: Record<string, number> = {};
async function nextDemoSeq(kind: 'member' | 'savings' | 'loanApp') {
  const prefix = kind === 'member' ? 'DIV-' : kind === 'savings' ? 'DIVS-' : 'DIVAPP-';
  demoSeq[kind] = (demoSeq[kind] ?? 900000) + 1;
  return `${prefix}${String(demoSeq[kind]).padStart(6, '0')}`;
}

main()
  .catch((e) => { console.error('SEED FAILED:', e); process.exit(1); })
  .finally(() => db.$disconnect());
