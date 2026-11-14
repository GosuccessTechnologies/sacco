'use client';
// Public subscribe form — used by the contact page (and reusable elsewhere).
import * as React from 'react';
import { Send } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export function PublicSubscribeForm() {
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email && !phone) { toast({ title: 'Enter an email or phone number', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/public/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: email || undefined, phone: phone || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not subscribe');
      toast({ title: 'Subscribed!', description: 'You will receive our notices and product updates.' });
      setEmail(''); setPhone(''); setName('');
    } catch (err) {
      toast({ title: 'Subscription failed', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={subscribe} className="mt-5 space-y-2.5">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name"
             className="dsms-input h-11 w-full" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email address" aria-label="Email address"
             className="dsms-input h-11 w-full" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="Phone (optional)" aria-label="Phone number"
             className="dsms-input h-11 w-full" />
      <button type="submit" disabled={busy} className="public-btn-primary w-full justify-center !py-3 text-sm disabled:opacity-60">
        <Send className="h-4 w-4" /> {busy ? 'Subscribing…' : 'Subscribe'}
      </button>
    </form>
  );
}
