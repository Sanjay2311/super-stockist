export type Paise = number;

/** Convert a rupee amount (possibly with 2 decimals) to integer paise. */
export function rupees(amount: number): Paise {
  return Math.round(amount * 100);
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

/** Format integer paise as an en-IN currency string (lakh/crore grouping). */
export function formatINR(paise: Paise): string {
  return inr.format(paise / 100);
}
