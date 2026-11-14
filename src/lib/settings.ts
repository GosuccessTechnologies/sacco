// ============================================================================
// SiteConfig service — typed key/value store. DEVELOPER_GUIDE.md §17.2.6/7
// ============================================================================
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { SETTINGS_DEFAULTS, type SettingsKey } from '@/lib/settings-defaults';

export { SETTINGS_DEFAULTS } from '@/lib/settings-defaults';
export type {
  EntityConfig, FeaturesConfig, LimitsConfig, GlMapConfig, SharesConfig,
  PayrollConfig, WebsiteConfig, SeoConfig, CacheConfig, SettingsKey,
} from '@/lib/settings-defaults';

export async function getSettings<K extends SettingsKey>(key: K) {
  const row = await db.siteConfig.findUnique({ where: { key } });
  if (!row?.value) return SETTINGS_DEFAULTS[key] as (typeof SETTINGS_DEFAULTS)[K];
  return { ...(SETTINGS_DEFAULTS[key] as object), ...(row.value as object) } as (typeof SETTINGS_DEFAULTS)[K];
}

export async function getSettingsRaw(K: string): Promise<unknown> {
  const row = await db.siteConfig.findUnique({ where: { key: K } });
  return row?.value ?? null;
}

export async function setSettings(key: SettingsKey, value: object, updatedById?: string) {
  await db.siteConfig.upsert({
    where: { key },
    create: { key, value: value as any, updatedById },
    update: { value: value as any, updatedById, updatedAt: new Date() },
  });
  revalidatePath('/', 'layout');
  return true;
}

export async function getAllSettings() {
  const keys = Object.keys(SETTINGS_DEFAULTS) as SettingsKey[];
  const entries = await Promise.all(keys.map(async (k) => [k, await getSettings(k)] as const));
  return Object.fromEntries(entries);
}
