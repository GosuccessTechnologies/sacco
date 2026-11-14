// Email template render test (Instr 8) — renders the universal branded layout
// for key templates and saves a preview HTML file for visual inspection.
import { getBrand, brandedEmail } from '../src/lib/email-template';
import { renderTemplate } from '../src/lib/notify';
import { db } from '../src/lib/db';

async function main() {
  const brand = await getBrand();
  console.log('brand:', brand.name, '| primary:', brand.primary, '| logo:', brand.logoUrl);

  // 1) member_welcome with CTA
  const welcome = await renderTemplate('member_welcome', { name: 'Grace', memberNumber: 'DIV-900001' });
  const welcomeCta = brandedEmail({
    brand,
    title: welcome.email!.subject,
    bodyHtml: welcome.email!.html.match(/<div style="font-size:14px;color:#2E4038;line-height:1.7;">([\s\S]*?)<\/div>/)![1],
    preheader: 'Your member number is inside',
    ctaLabel: 'Open my portal', ctaHref: 'http://localhost:3000/dashboard',
  });
  await Bun.write('/tmp/render/email-welcome.html', welcomeCta.html);
  console.log('welcome email ->', welcome.email!.subject, `(${welcomeCta.html.length} bytes)`);

  // 2) loan_approved (email + sms)
  const approved = await renderTemplate('loan_approved', { name: 'Grace', amount: 'KES 150,000.00', productName: 'Development Loan' });
  await Bun.write('/tmp/render/email-approved.html', approved.email!.html);
  console.log('approved email ->', approved.email!.subject);
  console.log('approved sms  ->', approved.sms);

  // 3) repayment_due with CTA
  const reminder = await renderTemplate('repayment_due', { name: 'Grace', amount: 'KES 12,500.00', loanNumber: 'DIVL-000001', dueDate: '2026-11-19' });
  const reminderCta = brandedEmail({
    brand,
    title: reminder.email!.subject,
    bodyHtml: reminder.email!.html.match(/<div style="font-size:14px;color:#2E4038;line-height:1.7;">([\s\S]*?)<\/div>/)![1],
    preheader: 'Installment due soon',
    ctaLabel: 'Repay from your portal', ctaHref: 'http://localhost:3000/dashboard/loans',
  });
  await Bun.write('/tmp/render/email-reminder.html', reminderCta.html);
  console.log('reminder email ->', reminder.email!.subject);

  // 4) application_received (welcome-on-receipt)
  const received = await renderTemplate('application_received', { name: 'Joseph', applicationNumber: 'DIVA-000010' });
  await Bun.write('/tmp/render/email-received.html', received.email!.html);
  console.log('received email ->', received.email!.subject);

  // SMTP demo mode check
  const smtp = await db.integrationCredential.findUnique({ where: { provider: 'SMTP' } });
  console.log('SMTP row:', smtp ? { demoMode: smtp.demoMode, status: smtp.status, hasConfig: Boolean(smtp.config) } : null);
  const sms = await db.integrationCredential.findUnique({ where: { provider: 'SMS_GATEWAY' } });
  console.log('SMS row:', sms ? { demoMode: sms.demoMode, status: sms.status } : null);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
