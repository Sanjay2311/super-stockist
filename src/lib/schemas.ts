import { z } from 'zod';

export const TERRITORY_TYPES = ['ZONE', 'AREA', 'NEIGHBORHOOD', 'PINCODE'] as const;

export const territorySchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(TERRITORY_TYPES),
  parentId: z.string().uuid().nullable(),
  estimatedMarketPotential: z.number().int().min(0).optional(),
  estimatedDistributorCount: z.number().int().min(0).optional(),
});

export type TerritoryInput = z.infer<typeof territorySchema>;

// ── CRM enum value lists ────────────────────────────────────────────────────
export const ACTIVITY_TYPES = ['CALL', 'WHATSAPP', 'MEETING', 'PRESENTATION', 'SAMPLE', 'QUOTATION', 'NEGOTIATION', 'FOLLOW_UP', 'ORDER', 'PAYMENT_DISCUSSION', 'COMPLAINT', 'OTHER'] as const;
export const TASK_TYPES = ['FOLLOW_UP', 'MEETING', 'CALL', 'QUOTATION_CHASE', 'DISTRIBUTOR_REVIEW', 'REORDER_NUDGE', 'COLLECTION', 'OTHER'] as const;
export const TASK_PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const;
export const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export const LOST_REASONS = ['MARGIN', 'PRICE', 'EXISTING_COMPETITOR', 'CREDIT_TERMS', 'PRODUCT_RANGE', 'BRAND_AWARENESS', 'TERRITORY_CONFLICT', 'MOQ', 'NOT_INTERESTED', 'RETAILER_DEMAND_CONCERN', 'STOCK_AVAILABILITY', 'OTHER'] as const;
export const WORKING_CAPITAL_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;

// zod v4: `z.uuid()` / `z.email()` replace the deprecated `z.string().uuid()` / `z.string().email()`.
export const leadSchema = z.object({
  businessName: z.string().min(2).max(160),
  contactPerson: z.string().min(2).max(120),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
  email: z.email().optional().or(z.literal('')),
  address: z.string().max(400).optional().or(z.literal('')),
  territoryId: z.uuid().nullable().optional(),
  pincode: z.string().regex(/^\d{6}$/).optional().or(z.literal('')),
  location: z.string().max(400).optional().or(z.literal('')),
  existingBusinessType: z.string().max(160).optional().or(z.literal('')),
  yearsInBusiness: z.coerce.number().int().min(0).max(200).optional(),
  expectedFfMonthlyPotential: z.coerce.number().int().min(0).default(0),
  expectedCreditRequirement: z.coerce.number().int().min(0).optional(),
  workingCapitalCapability: z.enum(WORKING_CAPITAL_LEVELS).optional(),
  deliveryVehicles: z.coerce.number().int().min(0).default(0),
  salesmen: z.coerce.number().int().min(0).default(0),
  retailerNetwork: z.coerce.number().int().min(0).default(0),
  geographicCoverage: z.string().max(240).optional().or(z.literal('')),
  assignedEmployeeId: z.uuid().nullable().optional(),
});
export type LeadInput = z.infer<typeof leadSchema>;

export const scoreInputsSchema = z.object({
  retailerNetwork: z.number().min(0).max(1),
  categoryExperience: z.number().min(0).max(1),
  geoCoverage: z.number().min(0).max(1),
  salesmen: z.number().min(0).max(1),
  deliveryInfra: z.number().min(0).max(1),
  workingCapital: z.number().min(0).max(1),
  brandPortfolio: z.number().min(0).max(1),
  reputation: z.number().min(0).max(1),
  willingness: z.number().min(0).max(1),
}).partial();

export const activitySchema = z.object({
  leadId: z.uuid().nullable().optional(),
  distributorId: z.uuid().nullable().optional(),
  type: z.enum(ACTIVITY_TYPES),
  occurredAt: z.coerce.date().default(() => new Date()),
  notes: z.string().max(2000).optional().or(z.literal('')),
  outcome: z.string().max(500).optional().or(z.literal('')),
  nextAction: z.string().max(500).optional().or(z.literal('')),
  nextFollowUpAt: z.coerce.date().nullable().optional(),
}).refine((v) => v.leadId || v.distributorId, { message: 'lead or distributor required' });
export type ActivityInput = z.infer<typeof activitySchema>;

export const taskSchema = z.object({
  title: z.string().min(2).max(200),
  type: z.enum(TASK_TYPES),
  leadId: z.uuid().nullable().optional(),
  distributorId: z.uuid().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).default('NORMAL'),
  dueDate: z.coerce.date(),
  assignedEmployeeId: z.uuid().nullable().optional(),
});
export type TaskInput = z.infer<typeof taskSchema>;

// ── Product master ─────────────────────────────────────────────────────────
export const PRODUCT_UNITS = ['G', 'KG', 'ML', 'L', 'PC'] as const;

const intGte0 = z.coerce.number().int().min(0);

export const productSchema = z.object({
  name: z.string().min(2).max(160),
  unit: z.enum(PRODUCT_UNITS).optional(),
  gstPct: z.coerce.number().int().min(0).max(28).optional(),
  active: z.boolean().optional(),
  volatilePrice: z.boolean().optional(),
  shelfLifeDays: intGte0.optional(),
  reorderLevel: intGte0.optional(),
  minStock: intGte0.optional(),
  maxStock: intGte0.optional(),
  preferredStock: intGte0.optional(),
  mrp: intGte0.nullable().optional(), // paise
});

// ── Distributor master (spec §4.4) ─────────────────────────────────────────
export const DISTRIBUTOR_STATUSES = ['PROSPECT', 'APPROVED', 'ACTIVE', 'TEMP_INACTIVE', 'SUSPENDED', 'CLOSED'] as const;
export const DISTRIBUTOR_GRADES = ['A', 'B', 'C'] as const;

export const distributorSchema = z.object({
  businessName: z.string().min(2).max(160),
  contactPerson: z.string().min(2).max(120),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
  email: z.email().optional().or(z.literal('')),
  address: z.string().max(400).optional().or(z.literal('')),
  territoryId: z.uuid().nullable().optional(),
  exclusive: z.boolean().optional(),
  assignedEmployeeId: z.uuid().nullable().optional(),
  status: z.enum(DISTRIBUTOR_STATUSES).optional(),
  grade: z.enum(DISTRIBUTOR_GRADES).nullable().optional(),
  creditLimit: z.coerce.number().int().min(0).optional(),            // paise
  creditDays: z.coerce.number().int().min(0).max(365).optional(),
  paymentTerms: z.string().max(200).optional().or(z.literal('')),
  expectedMonthlyPurchase: z.coerce.number().int().min(0).optional(), // paise
  // `review_date` is a Postgres `date` (string-mode) column — coerce the form
  // value through a Date for validation, then hand the DB a 'YYYY-MM-DD' string.
  reviewDate: z.coerce.date().nullable().optional()
    .transform((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d)),
  agreementStatus: z.string().max(80).optional().or(z.literal('')),
  // not a column — signals an accepted §13 exclusivity override on updateDistributor
  overrideReason: z.string().max(500).optional().or(z.literal('')),
});
export type DistributorInput = z.infer<typeof distributorSchema>;

// Lead → distributor conversion form (spec §4.4). `.default()` on several fields
// ⇒ the caller-facing type is `z.input`, not `z.infer`.
export const convertLeadSchema = z.object({
  territoryId: z.uuid().nullable().optional(),
  exclusive: z.boolean().optional(),
  assignedEmployeeId: z.uuid().nullable().optional(),
  creditLimit: z.coerce.number().int().min(0).default(0),            // paise
  creditDays: z.coerce.number().int().min(0).max(365).default(0),
  paymentTerms: z.string().max(200).optional().or(z.literal('')),
  expectedMonthlyPurchase: z.coerce.number().int().min(0).default(0), // paise
  overrideReason: z.string().max(500).optional().or(z.literal('')),
});
export type ConvertLeadInput = z.input<typeof convertLeadSchema>;

export const dailyReportSchema = z.object({
  reportDate: z.coerce.date(),
  areasVisited: z.array(z.string().max(120)).default([]),
  notes: z.string().max(4000).optional().or(z.literal('')),
  blockers: z.string().max(2000).optional().or(z.literal('')),
});
export type DailyReportInput = z.infer<typeof dailyReportSchema>;

// ── Schemes (spec §4.6 / §30) ─────────────────────────────────────────────
export const SCHEME_TYPES = ['FLAT_DISCOUNT', 'QTY_SCHEME', 'DISTRIBUTOR_INCENTIVE'] as const;
export const SCHEME_SCOPES = ['PRODUCT', 'CATEGORY', 'ALL'] as const;
export const SCHEME_BENEFIT_KINDS = ['PCT', 'AMOUNT', 'PER_UNIT'] as const;

export const schemeSchema = z.object({
  name: z.string().min(2).max(160),
  type: z.enum(SCHEME_TYPES),
  scopeType: z.enum(SCHEME_SCOPES),
  scopeId: z.uuid().nullable().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  minQty: z.coerce.number().int().min(0).nullable().optional(),
  minValue: z.coerce.number().int().min(0).nullable().optional(), // paise
  benefitKind: z.enum(SCHEME_BENEFIT_KINDS),
  benefitValue: z.coerce.number().min(0),                          // PCT: percent; AMOUNT/PER_UNIT: paise
  eligibleGrades: z.array(z.enum(['A', 'B', 'C'])).default([]),
  requiresApproval: z.boolean().optional(),
  active: z.boolean().optional(),
})
  .refine((v) => v.endDate >= v.startDate, { message: 'endDate is before startDate' })
  .refine((v) => v.scopeType === 'ALL' || v.scopeId != null, { message: 'scopeId is required for PRODUCT / CATEGORY scope' });
export type SchemeFormInput = z.input<typeof schemeSchema>;
