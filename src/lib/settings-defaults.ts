// Settings types + defaults — NO server-only imports (safe for scripts/seed).
// DEVELOPER_GUIDE.md §17.2.6/7

export interface EntityConfig {
  name: string; tagline: string; slogan: string;
  registrationNo: string; logoFileId: string | null;
  phone: string; altPhone: string; email: string;
  website: string; physicalAddress: string; town: string; county: string;
  country: string; postalCode: string; currency: string; timezone: string;
  fiscalYearStart: string;
}
export interface FeaturesConfig {
  memberSelfService: boolean; publicRegistration: boolean; publicApplications: boolean;
  showStatsOnWebsite: boolean; dividendsEnabled: boolean; twoFactorOptional: boolean;
}
export interface LimitsConfig {
  tellerMaxCents: number; guaranteeExposureCapPct: number; maxOpenGuarantees: number;
  writeOffApprovalCents: number; chequeClearingDays: number; standingOrderMaxFailures: number;
  approvalBands: { b1Cents: number; b2Cents: number }[];
}
export interface GlMapConfig {
  cashTeller: string; mpesaSettlement: string; bankOperations: string; chequesClearing: string;
  unallocatedFunds: string; memberSavings: string; shareCapital: string; loansPortfolio: string;
  feeIncome: string; loanInterestIncome: string; penaltyIncome: string; insuranceFeeIncome: string;
  interestOnDeposits: string; dividendExpense: string; writeOffExpense: string; cashShort: string;
  salariesExpense: string; statutoryLiabilities: string; retainedEarnings: string;
}
export interface SharesConfig {
  nominalValueCents: number; minSharesForMembership: number; transferFeeCents: number;
  allowTransfers: boolean; allowRefundsOnExit: boolean;
}
export interface PayrollConfig {
  payeBands: { upToCents: number; rateBps: number }[];
  nssfTier1Cents: number; nssfTier2Cents: number;
  shifRateBps: number; housingLevyRateBps: number;
  reviewedAt: string; note: string;
}
export interface WebsiteConfig { layout: 'boxed' | 'full'; wallpaper: string | null }
export interface SeoConfig {
  titleTemplate: string; description: string; keywords: string[];
  ogImageFileId: string | null;
}
export interface CacheConfig { enabled: boolean; revalidateSeconds: number }

export const SETTINGS_DEFAULTS = {
  entity: {
    name: 'Divine Sacco Society Ltd', tagline: 'Growing Together, Prospering Together',
    slogan: 'Your partner in financial growth', registrationNo: 'SASR/P/0012/2015',
    logoFileId: null,
    phone: '+254 700 123 456', altPhone: '+254 20 654 321', email: 'info@divinesacco.co.ke',
    website: 'https://divinesacco.co.ke', physicalAddress: 'Divine Plaza, Kenyatta Avenue',
    town: 'Nairobi', county: 'Nairobi', country: 'Kenya', postalCode: '00100',
    currency: 'KES', timezone: 'Africa/Nairobi', fiscalYearStart: '2015-01-01',
  } as EntityConfig,
  features: {
    memberSelfService: true, publicRegistration: true, publicApplications: true,
    showStatsOnWebsite: true, dividendsEnabled: true, twoFactorOptional: true,
  } as FeaturesConfig,
  limits: {
    tellerMaxCents: 20_000_000, guaranteeExposureCapPct: 30, maxOpenGuarantees: 3,
    writeOffApprovalCents: 10_000_000, chequeClearingDays: 3, standingOrderMaxFailures: 3,
    approvalBands: [{ b1Cents: 5_000_000 }, { b2Cents: 20_000_000 }],
  } as LimitsConfig,
  glMap: {
    cashTeller: '1000', mpesaSettlement: '1010', bankOperations: '1021', chequesClearing: '1030',
    unallocatedFunds: '2050', memberSavings: '2100', shareCapital: '3100', loansPortfolio: '1300',
    feeIncome: '4100', loanInterestIncome: '4130', penaltyIncome: '4140', insuranceFeeIncome: '4120',
    interestOnDeposits: '5400', dividendExpense: '5200', writeOffExpense: '5300', cashShort: '6900',
    salariesExpense: '5100', statutoryLiabilities: '2200', retainedEarnings: '3200',
  } as GlMapConfig,
  shares: {
    nominalValueCents: 500_00, minSharesForMembership: 250, transferFeeCents: 100_00,
    allowTransfers: true, allowRefundsOnExit: true,
  } as SharesConfig,
  payroll: {
    payeBands: [
      { upToCents: 240_000, rateBps: 0 }, { upToCents: 2_666_668, rateBps: 2500 },
      { upToCents: 5_666_670, rateBps: 3000 }, { upToCents: 9_666_672, rateBps: 3250 },
      { upToCents: Number.MAX_SAFE_INTEGER, rateBps: 3500 },
    ],
    nssfTier1Cents: 6_000, nssfTier2Cents: 12_000,
    shifRateBps: 275, housingLevyRateBps: 150,
    reviewedAt: '2026-01-01', note: 'Editable statutory tables — entity responsible for keeping current',
  } as PayrollConfig,
  website: { layout: 'boxed', wallpaper: null } as WebsiteConfig,
  seo: {
    titleTemplate: '%s — Divine Sacco', description: 'Divine Sacco Society Ltd — savings, loans, shares and dividends for members across Kenya.',
    keywords: ['sacco', 'savings', 'loans', 'dividends', 'kenya', 'nairobi'], ogImageFileId: null,
  } as SeoConfig,
  cache: { enabled: true, revalidateSeconds: 60 } as CacheConfig,
} as const;

export type SettingsKey = keyof typeof SETTINGS_DEFAULTS;
