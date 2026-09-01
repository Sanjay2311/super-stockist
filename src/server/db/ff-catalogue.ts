import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const skuSchema = z.object({
  product: z.string().min(1),
  category: z.enum(['Dry Fruits', 'Seeds', 'Flours', 'Spices', 'Other']),
  packLabel: z.string().min(1),
  packGrams: z.number().int().positive().nullable(),
  unit: z.enum(['G', 'KG']),
  currentPaise: z.number().int().positive(),
  mrpPaise: z.number().int().positive().nullable(),
  volatile: z.boolean(),
});
const catalogueSchema = z.object({
  brand: z.string(),
  gstInclusive: z.literal(true),
  gstPctByCategory: z.record(z.string(), z.number()),
  volatileNote: z.string(),
  skus: z.array(skuSchema).min(1),
});

export type CatalogueSku = z.infer<typeof skuSchema>;
export type Catalogue = z.infer<typeof catalogueSchema>;

const raw = readFileSync(join(process.cwd(), 'data', 'ff-catalogue.json'), 'utf8');
export const FF_CATALOGUE: Catalogue = catalogueSchema.parse(JSON.parse(raw));
