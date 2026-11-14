'use client';
// Notifications bell page — in-app feed (guide §16.6).
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, BellRing } from 'lucide-react';
import Link from 'next/link';
import { fmtDateTime } from '@/lib/client-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: async () => (await fetch('/api/notifications')).json() });
  const markAll = useMutation({
    mutationFn: async () => {
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const rows: any[] = notifications.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--t-heading-font)' }}>Notifications</h1>
        <Button size="sm" variant="outline" onClick={() => markAll.mutate()}><CheckCheck className="mr-1 h-3.5 w-3.5" /> Mark all read</Button>
      </div>
      {rows.length ? rows.map((n) => (
        <Link key={n.id} href={n.link || '/dashboard'} className="public-card block p-4" style={{ borderColor: n.read ? 'var(--t-border)' : 'var(--t-primary)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {!n.read ? <BellRing className="mt-0.5 h-5 w-5" style={{ color: 'var(--t-primary)' }} /> : <Bell className="mt-0.5 h-5 w-5 opacity-50" />}
              <div>
                <p className="text-sm font-bold">{n.title}</p>
                <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{n.body}</p>
                <p className="mt-1 text-[10px]" style={{ color: 'var(--t-muted-text)' }}>{fmtDateTime(n.createdAt)}</p>
              </div>
            </div>
            {!n.read && <Badge variant="outline">new</Badge>}
          </div>
        </Link>
      )) : (
        <div className="public-card section-pad text-center">
          <Bell className="mx-auto h-10 w-10 opacity-40" />
          <p className="mt-2 text-sm" style={{ color: 'var(--t-muted-text)' }}>No notifications yet.</p>
        </div>
      )}
    </div>
  );
}
