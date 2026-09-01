import { describe, it, expect } from 'vitest';
import { patchOnly } from '@/lib/patch';
import { leadSchema, taskSchema } from '@/lib/schemas';

describe('patchOnly', () => {
  it('drops schema .default() keys the caller never supplied (lead)', () => {
    const input = { businessName: 'Acme' };
    // zod re-injects deliveryVehicles/salesmen/retailerNetwork = 0 here
    const parsed = leadSchema.partial().parse(input);
    expect(parsed).toHaveProperty('deliveryVehicles');

    const data = patchOnly(input, parsed);
    expect(data).toEqual({ businessName: 'Acme' });
    expect(data).not.toHaveProperty('deliveryVehicles');
    expect(data).not.toHaveProperty('salesmen');
    expect(data).not.toHaveProperty('retailerNetwork');
  });

  it('drops the injected priority default the caller never supplied (task)', () => {
    const input = { title: 'Ring back' };
    const data = patchOnly(input, taskSchema.partial().parse(input));
    expect(data).toEqual({ title: 'Ring back' });
    expect(data).not.toHaveProperty('priority');
  });

  it('keeps a key the caller did supply even when it matches the default', () => {
    const input = { businessName: 'Acme', deliveryVehicles: 0 };
    const data = patchOnly(input, leadSchema.partial().parse(input));
    expect(data).toEqual({ businessName: 'Acme', deliveryVehicles: 0 });
  });
});
