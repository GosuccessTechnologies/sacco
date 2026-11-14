'use client';
// Public 5-step membership application — guide §8.6 (numbered stepper, 44px+ targets).
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, Contact2, Contact, HeartHandshake, PackageOpen, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

interface Kin { name: string; relationship: string; phone: string; email?: string; idNumber?: string }

export function ApplyWizard() {
  const params = useSearchParams();
  const preselect = params.get('product');
  const [step, setStep] = React.useState(0);
  const started = React.useRef(Date.now());
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const [f, setF] = React.useState({
    firstName: '', middleName: '', lastName: '', gender: '', dateOfBirth: '',
    nationalId: '', passportNo: '', kraPin: '',
    phone: '', email: '', physicalAddress: '', town: '', county: '',
    occupation: '', employerName: '', monthlyIncome: '',
    kinName: '', kinRelationship: '', kinPhone: '', kinEmail: '', kinId: '',
    savings: [] as string[], loans: [] as string[],
    agreedTerms: false, honeypot: '',
  });
  const set = (k: keyof typeof f, v: unknown) => setF((p) => ({ ...p, [k]: v as never }));

  const steps = [
    { title: 'Identity', icon: Contact2 },
    { title: 'Contact', icon: Contact },
    { title: 'Next of kin', icon: HeartHandshake },
    { title: 'Interests', icon: PackageOpen },
    { title: 'Terms & submit', icon: ShieldCheck },
  ];

  const savingsOptions = [
    { code: 'MAIN', label: 'Main Savings (compulsory)' },
    { code: 'HOLIDAY', label: 'Holiday Account' },
    { code: 'XMAS', label: 'Christmas Account' },
    { code: 'JUNIOR', label: 'Junior Account' },
    { code: 'FIXED12', label: 'Fixed Deposit' },
    { code: 'TARGET', label: 'Target Savings' },
  ];
  const loanOptions = [
    { code: 'DEV', label: 'Development Loan' },
    { code: 'EMER', label: 'Emergency Loan' },
    { code: 'SCH', label: 'School Fees Loan' },
    { code: 'BIZ', label: 'Business Booster' },
  ];

  React.useEffect(() => {
    if (preselect?.startsWith('L')) set('loans', [preselect]);
    else if (preselect) set('savings', [preselect === 'MAIN' ? 'MAIN' : preselect]);
  }, []);

  function validate(current: number): string | null {
    if (current === 0) {
      if (!f.firstName.trim() || !f.lastName.trim()) return 'First and last names are required';
      if (!f.gender) return 'Select gender';
      if (!/^\d{6,12}$/.test(f.nationalId)) return 'National ID must be 6–12 digits';
      if (!f.dateOfBirth) return 'Date of birth is required';
      const age = (Date.now() - new Date(f.dateOfBirth).getTime()) / (365.25 * 86400000);
      if (age < 18) return 'Applicants must be 18 years or older';
    }
    if (current === 1) {
      if (!/^\+?[0-9\s-]{9,15}$/.test(f.phone)) return 'Enter a valid phone number';
      if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return 'Enter a valid email (used for portal login)';
      if (f.physicalAddress.trim().length < 4) return 'Physical address is required';
    }
    if (current === 2) {
      if (!f.kinName.trim() || !f.kinPhone.trim() || !f.kinRelationship.trim()) return 'Next of kin name, relationship and phone are required';
      if (!/^\+?[0-9\s-]{9,15}$/.test(f.kinPhone)) return 'Kin phone is invalid';
    }
    if (current === 4 && !f.agreedTerms) return 'You must agree to the membership terms';
    return null;
  }

  async function submit() {
    setBusy(true);
    try {
      const kins: Kin[] = [{
        name: f.kinName.trim(),
        relationship: f.kinRelationship.trim(),
        phone: f.kinPhone.trim(),
        email: f.kinEmail || undefined,
        idNumber: f.kinId || undefined,
      }];
      const payload = {
        firstName: f.firstName.trim(), middleName: f.middleName || null, lastName: f.lastName.trim(),
        gender: f.gender, dateOfBirth: f.dateOfBirth, nationalId: f.nationalId,
        passportNo: f.passportNo || null, kraPin: f.kraPin || null,
        phone: f.phone.trim(), email: f.email.trim() || null,
        physicalAddress: f.physicalAddress.trim(), town: f.town || null, county: f.county || null,
        occupation: f.occupation || null, employerName: f.employerName || null,
        monthlyIncome: f.monthlyIncome || undefined,
        nextOfKins: kins,
        productsInterested: [
          ...savingsOptions.filter((o) => f.savings.includes(o.code)).map((o) => ({ type: 'savings', code: o.code })),
          ...loanOptions.filter((o) => f.loans.includes(o.code)).map((o) => ({ type: 'loan', code: o.code })),
        ],
        agreedTerms: f.agreedTerms, honeypot: f.honeypot, elapsedMs: Date.now() - started.current,
      };
      const res = await fetch('/api/public/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Application failed');
      setDone(data.applicationNumber);
    } catch (e) {
      toast({ title: 'Could not submit', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="public-card mx-auto max-w-2xl p-10 text-center">
        <CheckCircle2 className="mx-auto h-16 w-16" style={{ color: 'var(--t-success)' }} />
        <h2 className="mt-5 text-2xl font-extrabold" style={{ fontFamily: 'var(--t-heading-font)' }}>Application received!</h2>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>
          Your reference is <strong style={{ color: 'var(--t-primary)' }}>{done}</strong>. Our team will contact you within 2 working days.
          Keep your ID and next of kin details ready for verification.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href="/" className="public-btn-ghost !py-2.5 text-sm">Back to home</a>
          <a href="/login" className="public-btn-primary !py-2.5 text-sm">Member login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* stepper */}
      <ol className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-center gap-1.5">
            <span className={`grid h-8 w-8 place-items-center rounded-full ${i === step ? 'text-white' : i < step ? 'text-white' : ''}`}
                  style={{ background: i === step ? 'var(--t-primary)' : i < step ? 'var(--t-success)' : 'var(--t-border)' }}>
              {i < step ? <CheckCircle2 className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
            </span>
            <span style={{ color: i === step ? 'var(--t-primary)' : 'var(--t-muted-text)' }}>{i + 1}. {s.title}</span>
            {i < steps.length - 1 && <span className="mx-1.5 h-px w-8" style={{ background: 'var(--t-border)' }} />}
          </li>
        ))}
      </ol>

      <div className="public-card public-card-top section-pad space-y-5 sm:p-8">
        {step === 0 && (
          <>
            <h2 className="text-lg font-extrabold" style={{ fontFamily: 'var(--t-heading-font)' }}>Identity details</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <In label="First name *" value={f.firstName} onChange={(v) => set('firstName', v)} />
              <In label="Middle name" value={f.middleName} onChange={(v) => set('middleName', v)} />
              <In label="Last name *" value={f.lastName} onChange={(v) => set('lastName', v)} />
              <div>
                <label className="mb-1 block text-xs font-semibold">Gender *</label>
                <div className="flex gap-2">
                  {GENDERS.map((g) => (
                    <button key={g.value} type="button" onClick={() => set('gender', g.value)}
                            className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium ${f.gender === g.value ? 'text-white' : ''}`}
                            style={f.gender === g.value ? { background: 'var(--t-primary)', borderColor: 'var(--t-primary)' } : { background: 'var(--t-surface)', borderColor: 'var(--t-border)' }}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
              <In label="Date of birth *" type="date" value={f.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} />
              <In label="National ID *" value={f.nationalId} onChange={(v) => set('nationalId', v.replace(/\D/g, ''))} placeholder="8 digits" />
              <In label="Passport No (if any)" value={f.passportNo} onChange={(v) => set('passportNo', v)} />
              <In label="KRA PIN" value={f.kraPin} onChange={(v) => set('kraPin', v)} />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-lg font-extrabold" style={{ fontFamily: 'var(--t-heading-font)' }}>Contact details</h2>
            <p className="-mt-2 text-xs" style={{ color: 'var(--t-muted-text)' }}>Email + phone become your portal login identifiers.</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <In label="Phone *" value={f.phone} onChange={(v) => set('phone', v)} placeholder="+2547…" />
              <In label="Email" type="email" value={f.email} onChange={(v) => set('email', v)} placeholder="you@example.com" />
              <In label="Physical address *" value={f.physicalAddress} onChange={(v) => set('physicalAddress', v)} className="sm:col-span-2" />
              <In label="Town" value={f.town} onChange={(v) => set('town', v)} />
              <In label="County" value={f.county} onChange={(v) => set('county', v)} />
              <In label="Occupation" value={f.occupation} onChange={(v) => set('occupation', v)} />
              <In label="Employer" value={f.employerName} onChange={(v) => set('employerName', v)} />
              <In label="Monthly income (KES)" value={f.monthlyIncome} onChange={(v) => set('monthlyIncome', v.replace(/[^\d.,]/g, ''))} placeholder="45,000" />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-lg font-extrabold" style={{ fontFamily: 'var(--t-heading-font)' }}>Next of kin</h2>
            <p className="-mt-2 text-xs" style={{ color: 'var(--t-muted-text)' }}>Required for membership and any future loan applications.</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <In label="Kin full name *" value={f.kinName} onChange={(v) => set('kinName', v)} className="sm:col-span-2" />
              <In label="Relationship *" value={f.kinRelationship} onChange={(v) => set('kinRelationship', v)} placeholder="Sibling / Spouse / Parent" />
              <In label="Kin phone *" value={f.kinPhone} onChange={(v) => set('kinPhone', v)} />
              <In label="Kin email" type="email" value={f.kinEmail} onChange={(v) => set('kinEmail', v)} />
              <In label="Kin ID number" value={f.kinId} onChange={(v) => set('kinId', v.replace(/\D/g, ''))} />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-lg font-bold">Products of interest</h2>
            <p className="-mt-2 text-xs" style={{ color: 'var(--t-muted-text)' }}>Optional — you can open/change products any time after joining. Main Savings is compulsory for all members.</p>
            <fieldset className="rounded-xl border p-3" style={{ borderColor: 'var(--t-border)' }}>
              <legend className="px-1 text-xs font-bold">Savings accounts</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {savingsOptions.map((o) => (
                  <label key={o.code} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: f.savings.includes(o.code) ? 'color-mix(in srgb, var(--t-primary) 10%, transparent)' : 'transparent' }}>
                    <input type="checkbox" checked={f.savings.includes(o.code)} onChange={(e) => set('savings', e.target.checked ? [...f.savings, o.code] : f.savings.filter((x) => x !== o.code))} style={{ accentColor: 'var(--t-primary)' }} />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="rounded-xl border p-3" style={{ borderColor: 'var(--t-border)' }}>
              <legend className="px-1 text-xs font-bold">Loans (future interest)</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {loanOptions.map((o) => (
                  <label key={o.code} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: f.loans.includes(o.code) ? 'color-mix(in srgb, var(--t-primary) 10%, transparent)' : 'transparent' }}>
                    <input type="checkbox" checked={f.loans.includes(o.code)} onChange={(e) => set('loans', e.target.checked ? [...f.loans, o.code] : f.loans.filter((x) => x !== o.code))} style={{ accentColor: 'var(--t-primary)' }} />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-lg font-bold">Review & submit</h2>
            <dl className="grid gap-x-6 gap-y-2 rounded-xl border p-4 text-sm sm:grid-cols-2" style={{ borderColor: 'var(--t-border)' }}>
              <Row k="Name" v={`${f.firstName} ${f.middleName} ${f.lastName}`} />
              <Row k="ID" v={f.nationalId} />
              <Row k="Phone" v={f.phone} />
              <Row k="Email" v={f.email || '—'} />
              <Row k="Address" v={f.physicalAddress} />
              <Row k="Next of kin" v={`${f.kinName} (${f.kinRelationship})`} />
            </dl>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--t-border)' }}>
              <input type="checkbox" checked={f.agreedTerms} onChange={(e) => set('agreedTerms', e.target.checked)} className="mt-1" style={{ accentColor: 'var(--t-primary)' }} />
              <span>
                I confirm the information given is true, I accept the Divine Sacco membership terms (minimum shareholding, monthly contributions and applicable fees), and I consent to being contacted about my application.
              </span>
            </label>
            <input value={f.honeypot} onChange={(e) => set('honeypot', e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
          </>
        )}

        {/* nav */}
        <div className="mt-2 flex items-center justify-between border-t pt-4" style={{ borderColor: 'var(--t-border)' }}>
          <button type="button" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}
                  className="public-btn-ghost !px-5 !py-2.5 text-sm disabled:opacity-40">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {step < 4 ? (
            <button type="button" onClick={() => { const err = validate(step); if (err) { toast({ title: err, variant: 'destructive' }); return; } setStep((s) => s + 1); }}
                    className="public-btn-primary !px-6 !py-2.5 text-sm">
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={busy || !f.agreedTerms}
                    className="public-btn-primary !px-6 !py-2.5 text-sm disabled:opacity-50">
              {busy ? 'Submitting…' : 'Submit application'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function In({ label, value, onChange, type = 'text', placeholder, className = '' }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; className?: string }) {
  const id = `af-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="dsms-input h-11"
        style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,.14)' }}
      />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-xs font-semibold" style={{ color: 'var(--t-muted-text)' }}>{k}</dt>
      <dd className="truncate text-right text-sm font-medium">{v || '—'}</dd>
    </div>
  );
}
