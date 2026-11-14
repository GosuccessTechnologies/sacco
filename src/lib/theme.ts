// ============================================================================
// Theme engine — DEVELOPER_GUIDE.md §7.1. Server-rendered CSS variables
// (zero FOUC), dark variants, Google Font links. DB-stored presets.
// ============================================================================
import { db } from '@/lib/db';

export interface ThemeTokens {
  colors: Record<string, string>;
  fonts: { heading: string; body: string; headingWeight?: number; scale?: number };
  heading?: { case?: string; letterSpacing?: string };
  radius?: string;
  backgrounds?: { bodyPattern?: string };
  divider?: { style?: string; color?: string; thickness?: string };
  scrollbar?: { thumb?: string; track?: string; width?: string; radius?: string };
  layout?: { sidebarStyle?: string; headerStyle?: string };
  dark?: ThemeTokens;
}

export const FALLBACK_TOKENS: ThemeTokens = {
  colors: {
    primary: '#0E7C5A', primaryFg: '#FFFFFF', accent: '#F2B33C', accentFg: '#23180A',
    bg: '#F7F9F8', surface: '#FFFFFF', text: '#1B2420', mutedText: '#5C6B63', border: '#DCE5DF',
    sidebar: '#0F241C', sidebarText: '#D7E7DE', header: '#FFFFFF', headerText: '#1B2420',
    footer: '#0F241C', footerText: '#CFE2D8',
    cardHero: 'linear-gradient(135deg,#0E7C5A 0%,#0A5C43 100%)', cardHeroFg: '#FFFFFF',
    tableHeaderA: '#EDF4F0', tableHeaderB: '#E2EDE7', zebra: '#F3F8F5',
    danger: '#C0392B', warning: '#B7791F', success: '#1E8E5A', info: '#2C7A7B',
  },
  fonts: { heading: 'Playfair Display', body: 'Inter', headingWeight: 700, scale: 1 },
  radius: '0.75rem',
  scrollbar: { thumb: '#0E7C5A', track: '#EDF3F0', width: '10px', radius: '8px' },
  divider: { style: 'solid', color: '#DCE5DF', thickness: '1px' },
};

export async function getActiveTheme() {
  try {
    const theme = await db.theme.findFirst({ where: { active: true } });
    if (theme?.tokens) return { id: theme.id, name: theme.name, tokens: theme.tokens as unknown as ThemeTokens };
  } catch { /* db not ready */ }
  return { id: null, name: 'Divine Emerald (fallback)', tokens: FALLBACK_TOKENS };
}

const kebab = (s: string) => s.replace(/([A-Z])/g, '-$1').toLowerCase();
const cssSanitize = (v: string) => (/^#[0-9a-fA-F]{3,8}$|^rgba?\(|^linear-gradient\(|^var\(|^[a-zA-Z0-9 ,.%-]+$/.test(v) ? v : 'transparent');

/** Full CSS variable sheet for a token set (shadcn tokens + DSMS tokens). */
export function varsFromTokens(t: ThemeTokens): Record<string, string> {
  const c = { ...FALLBACK_TOKENS.colors, ...(t.colors ?? {}) };
  const v: Record<string, string> = {
    // shadcn tokens follow the theme
    '--primary': cssSanitize(c.primary),
    '--primary-foreground': cssSanitize(c.primaryFg ?? '#fff'),
    '--secondary': cssSanitize(c.zebra),
    '--secondary-foreground': cssSanitize(c.text),
    '--background': cssSanitize(c.bg),
    '--foreground': cssSanitize(c.text),
    '--card': cssSanitize(c.surface),
    '--card-foreground': cssSanitize(c.text),
    '--popover': cssSanitize(c.surface),
    '--popover-foreground': cssSanitize(c.text),
    '--muted': cssSanitize(c.tableHeaderA),
    '--muted-foreground': cssSanitize(c.mutedText),
    '--accent': cssSanitize(c.tableHeaderA),
    '--accent-foreground': cssSanitize(c.text),
    '--destructive': cssSanitize(c.danger),
    '--border': cssSanitize(c.border),
    '--input': cssSanitize(c.border),
    '--ring': cssSanitize(c.primary),
    '--sidebar': cssSanitize(c.sidebar),
    '--sidebar-foreground': cssSanitize(c.sidebarText),
    '--sidebar-primary': cssSanitize(c.primary),
    '--sidebar-primary-foreground': cssSanitize(c.primaryFg ?? '#fff'),
    '--sidebar-accent': 'rgba(255,255,255,0.08)',
    '--sidebar-accent-foreground': cssSanitize(c.sidebarText),
    '--sidebar-border': 'rgba(255,255,255,0.12)',
    '--sidebar-ring': cssSanitize(c.primary),
    '--radius': t.radius ?? '0.75rem',
    // DSMS tokens
    '--t-primary': cssSanitize(c.primary),
    '--t-primary-fg': cssSanitize(c.primaryFg ?? '#fff'),
    '--t-accent': cssSanitize(c.accent),
    '--t-accent-fg': cssSanitize(c.accentFg ?? '#23180A'),
    '--t-bg': cssSanitize(c.bg),
    '--t-surface': cssSanitize(c.surface),
    '--t-text': cssSanitize(c.text),
    '--t-muted-text': cssSanitize(c.mutedText),
    '--t-border': cssSanitize(c.border),
    '--t-sidebar': cssSanitize(c.sidebar),
    '--t-sidebar-text': cssSanitize(c.sidebarText),
    '--t-header': cssSanitize(c.header),
    '--t-header-text': cssSanitize(c.headerText),
    '--t-footer': cssSanitize(c.footer),
    '--t-footer-text': cssSanitize(c.footerText),
    '--t-card-hero': cssSanitize(c.cardHero),
    '--t-card-hero-fg': cssSanitize(c.cardHeroFg ?? '#fff'),
    '--t-table-header-a': cssSanitize(c.tableHeaderA),
    '--t-table-header-b': cssSanitize(c.tableHeaderB),
    '--t-zebra': cssSanitize(c.zebra),
    '--t-danger': cssSanitize(c.danger),
    '--t-warning': cssSanitize(c.warning),
    '--t-success': cssSanitize(c.success),
    '--t-info': cssSanitize(c.info),
    '--t-heading-font': `'${t.fonts?.heading ?? 'Playfair Display'}', serif`,
    '--t-body-font': `'${t.fonts?.body ?? 'Inter'}', sans-serif`,
    '--t-heading-weight': String(t.fonts?.headingWeight ?? 700),
    '--t-heading-tracking': t.heading?.letterSpacing ?? '-0.01em',
    '--t-scrollbar-thumb': cssSanitize(t.scrollbar?.thumb ?? c.primary),
    '--t-scrollbar-track': cssSanitize(t.scrollbar?.track ?? '#EDF3F0'),
    '--t-scrollbar-width': t.scrollbar?.width ?? '10px',
    '--t-divider-color': cssSanitize(t.divider?.color ?? c.border),
    '--t-divider-style': t.divider?.style ?? 'solid',
    '--t-divider-thickness': t.divider?.thickness ?? '1px',
    '--t-radius': t.radius ?? '0.75rem',
  };
  return v;
}

export function varsToCss(vars: Record<string, string>): string {
  return Object.entries(vars).map(([k, val]) => `${k}:${val}`).join(';');
}

/** <link> tags for the theme's Google Fonts. */
export function fontLinks(t: ThemeTokens): string[] {
  const fams = [t.fonts?.heading, t.fonts?.body, t.dark?.fonts?.heading ?? t.fonts?.heading, t.dark?.fonts?.body ?? t.fonts?.body];
  const uniq = [...new Set(fams.filter(Boolean) as string[])];
  return uniq.map((f) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`);
}
