// ============================================================================
// DSMS shared constants — single source (mirrors DEVELOPER_GUIDE.md Appendix A)
// Safe for client import (no server-only code).
// ============================================================================

export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'MEMBER'] as const;
export type Role = (typeof ROLES)[number];

export const DESIGNATIONS = ['MANAGER', 'TELLER', 'LOAN_OFFICER', 'ACCOUNTANT', 'COMPLIANCE', 'RECEPTION'] as const;
export type Designation = (typeof DESIGNATIONS)[number];

// ---------------------------------------------------------------- permissions
export const PERMISSIONS = {
  // members
  members_view: 'View member directory',
  members_view_pii: 'View masked PII (IDs, phones)',
  members_create: 'Register members / approve applications',
  members_edit: 'Edit member data',
  members_status: 'Suspend / blacklist / exit members',
  members_kyc_verify: 'Verify KYC',
  members_export: 'Export member data',
  // savings
  savings_products: 'Configure savings products',
  savings_post: 'Post savings transactions',
  savings_reverse: 'Reverse savings transactions',
  savings_orders: 'Manage standing orders',
  savings_export: 'Export savings data',
  // loans
  loans_products: 'Configure loan products',
  loans_view: 'View loan portfolio',
  loans_apply_on_behalf: 'Create applications on behalf of members',
  loans_vet: 'Vet applications (scorecard)',
  loans_approve_b1: 'Approve loans (band 1 ≤50k)',
  loans_approve_b2: 'Approve loans (band 2 ≤200k)',
  loans_approve_b3: 'Approve loans (band 3 >200k)',
  loans_disburse: 'Disburse loans',
  loans_repay_post: 'Post loan repayments',
  loans_actions: 'Reschedule / waiver / write-off',
  loans_export: 'Export loans data',
  // shares & dividends
  shares_post: 'Post share purchases / refunds',
  shares_transfer: 'Transfer shares between members',
  dividends_run: 'Create / compute dividend runs',
  dividends_approve: 'Approve dividend runs',
  dividends_pay: 'Execute dividend payouts',
  // fosa
  fosa_session: 'Open / close teller sessions',
  fosa_post: 'Post over-the-counter transactions',
  fosa_override: 'Override teller limits',
  fosa_clear_cheque: 'Mark cheques cleared / bounced',
  fosa_statements: 'Generate statements',
  // accounting
  accounting_coa: 'Manage chart of accounts',
  accounting_journal: 'View journal',
  accounting_journal_manual: 'Post manual journals',
  accounting_reverse: 'Reverse journal entries',
  accounting_expenses: 'Manage vendors & expenses',
  accounting_expenses_approve: 'Approve expenses',
  accounting_banks: 'Manage bank accounts',
  accounting_reconcile: 'Import / match bank statements',
  accounting_reconcile_approve: 'Approve reconciliations',
  accounting_statements: 'Financial statements (TB/IS/BS)',
  accounting_export: 'Export accounting data',
  // payments & integrations
  payments_view: 'View payment transactions',
  payments_allocate: 'Allocate unallocated payments',
  payments_stk: 'Trigger STK pushes',
  integrations_manage: 'Manage integration credentials',
  // reports & analytics
  analytics_view: 'View analytics dashboards',
  reports_view: 'View regulatory reports',
  reports_generate: 'Generate regulatory reports',
  reports_submit: 'Submit regulatory returns',
  reports_export: 'Export reports',
  // communications
  comms_templates: 'Manage message templates',
  comms_groups: 'Manage contact groups',
  comms_send: 'Send broadcasts',
  comms_logs: 'View delivery logs',
  // users, rbac, audit
  users_view: 'View users',
  users_manage: 'Create / edit users',
  users_impersonate: 'Cross-login into other accounts',
  rbac_manage: 'Edit permission matrix',
  audit_view: 'View audit trail',
  audit_export: 'Export audit trail',
  // hr & payroll
  hr_staff: 'Manage staff',
  hr_attendance: 'Manage attendance',
  hr_leave_approve: 'Approve leave requests',
  payroll_run: 'Process payroll runs',
  payroll_approve: 'Approve payroll runs',
  payroll_pay: 'Execute payroll payments',
  // platform
  settings_entity: 'Edit entity configuration',
  settings_website: 'Edit website content',
  settings_features: 'Edit feature flags & limits',
  settings_themes: 'Manage themes',
  settings_letterheads: 'Manage letterheads',
  settings_cache: 'Manage cache',
  settings_integrations_view: 'View integration statuses',
  files_view: 'Use file manager',
  files_delete: 'Delete files',
} as const;
export type PermissionKey = keyof typeof PERMISSIONS;

// ------------------------------------------------- designation default sets
export const DESIGNATION_PERMISSIONS: Record<Designation, PermissionKey[]> = {
  MANAGER: [
    'members_view','members_view_pii','members_create','members_edit','members_status','members_kyc_verify','members_export',
    'savings_post','savings_reverse','savings_orders','savings_export',
    'loans_view','loans_apply_on_behalf','loans_vet','loans_approve_b1','loans_approve_b2','loans_approve_b3','loans_disburse','loans_repay_post','loans_actions','loans_export',
    'shares_post','shares_transfer','dividends_run','dividends_approve','dividends_pay',
    'fosa_session','fosa_post','fosa_override','fosa_clear_cheque','fosa_statements',
    'accounting_journal','accounting_reverse','accounting_expenses_approve','accounting_reconcile_approve','accounting_statements','accounting_export',
    'payments_view','payments_allocate','payments_stk',
    'analytics_view','reports_view','reports_generate','reports_submit','reports_export',
    'comms_send','comms_logs','comms_groups',
    'users_view','audit_view','audit_export',
    'hr_staff','hr_attendance','hr_leave_approve','payroll_approve',
    'files_view','files_delete',
  ],
  TELLER: [
    'members_view','savings_post','fosa_session','fosa_post','fosa_statements',
    'loans_view','loans_repay_post','payments_view','files_view',
  ],
  LOAN_OFFICER: [
    'members_view','loans_view','loans_apply_on_behalf','loans_vet','loans_approve_b1','loans_disburse','loans_export',
    'comms_send','comms_groups','analytics_view','files_view','savings_export',
  ],
  ACCOUNTANT: [
    'members_view','loans_view','loans_approve_b2','loans_disburse','loans_repay_post',
    'savings_post','savings_reverse','savings_export',
    'accounting_coa','accounting_journal','accounting_journal_manual','accounting_reverse','accounting_expenses','accounting_banks','accounting_reconcile','accounting_statements','accounting_export',
    'dividends_run','dividends_pay','shares_post',
    'payments_view','payments_allocate',
    'analytics_view','reports_view','reports_generate','reports_export',
    'fosa_clear_cheque','hr_attendance','payroll_run','payroll_pay',
    'files_view',
  ],
  COMPLIANCE: [
    'members_view','members_view_pii','members_create','members_edit','members_kyc_verify','members_export',
    'loans_view','reports_view','reports_submit','reports_export',
    'comms_send','comms_logs','comms_groups',
    'audit_view','audit_export','analytics_view','files_view',
  ],
  RECEPTION: [
    'members_view','loans_view','shares_post','files_view',
  ],
};

// MEMBER fixed permissions (row-scoped server-side)
export const MEMBER_PERMISSIONS: PermissionKey[] = [
  'members_view','savings_post','loans_view','shares_post','payments_stk','files_view',
];

// ---------------------------------------------------------------- statuses
export const MEMBER_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'BLACKLISTED', 'EXITED'] as const;
export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DISABLED'] as const;
export const APPLICATION_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] as const;
export const LOAN_APP_STATUSES = ['DRAFT', 'SUBMITTED', 'GUARANTOR_PENDING', 'VETTING', 'APPROVED', 'REJECTED', 'DISBURSED', 'CANCELLED'] as const;
export const LOAN_STATUSES = ['ACTIVE', 'OVERDUE', 'DEFAULTED', 'CLOSED', 'WRITTEN_OFF'] as const;
export const ACCOUNT_STATUSES = ['OPEN', 'FROZEN', 'DORMANT', 'CLOSED'] as const;
export const SAVINGS_TXN_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'FEE', 'INTEREST', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'REVERSAL'] as const;
export const SAVINGS_CHANNELS = ['COUNTER', 'MPESA', 'BANK', 'STANDING_ORDER', 'INTERNAL', 'INTEREST_POSTING', 'PAYROLL', 'PORTAL', 'DIVIDEND_CREDIT'] as const;
export const GL_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const;

export const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

// Google Fonts catalog (Appendix C)
export const GOOGLE_FONTS = [
  'Inter','Roboto','Open Sans','Lato','Montserrat','Poppins','Raleway','Oswald',
  'Playfair Display','Merriweather','Nunito','Rubik','Work Sans','DM Sans','Manrope',
  'Urbanist','Plus Jakarta Sans','Source Sans 3','Fira Sans','Karla','Mulish','Barlow',
  'Josefin Sans','Space Grotesk','Sora','Outfit','Epilogue','Lexend','Public Sans','Figtree',
] as const;

export const APPROVAL_BANDS = [
  { label: 'Band 1 (≤ KES 50,000)', maxCents: 5_000_000, permission: 'loans_approve_b1' as PermissionKey, also: 'MANAGER' },
  { label: 'Band 2 (≤ KES 200,000)', maxCents: 20_000_000, permission: 'loans_approve_b2' as PermissionKey, also: 'MANAGER' },
  { label: 'Band 3 (> KES 200,000)', maxCents: Number.MAX_SAFE_INTEGER, permission: 'loans_approve_b3' as PermissionKey, also: 'MANAGER+SUPER_ADMIN' },
];
