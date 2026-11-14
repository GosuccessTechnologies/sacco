// Dynamic member-PWA manifest — theme-colored from the active theme (guide §7.7).
import { getActiveTheme } from '@/lib/theme';
import { getSettings } from '@/lib/settings';

export async function GET() {
  const [theme, entity] = await Promise.all([getActiveTheme(), getSettings('entity')]);
  const colors = (theme.tokens as any)?.colors ?? {};
  return Response.json(
    {
      name: `${entity.name} — Member Portal`,
      short_name: 'Divine Sacco',
      description: `${entity.tagline} — member self-service PWA: balances, loans, shares, statements.`,
      start_url: '/dashboard',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: colors.bg ?? '#F7F9F8',
      theme_color: colors.primary ?? '#0E7C5A',
      icons: [
        { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/logo.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
}
