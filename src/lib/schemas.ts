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
