/**
 * `schema.partial().parse(input)` re-injects every `.default()` value, so an
 * update path would write defaults for columns the caller never sent. Keep only
 * the keys actually present on `input`.
 */
export function patchOnly<T extends Record<string, unknown>>(input: object, parsed: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(parsed).filter(([k]) => k in (input as Record<string, unknown>)),
  ) as Partial<T>;
}
