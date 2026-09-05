export interface ReportFilters {
  from: string | null;
  to: string | null;
  territoryId: string | null;
  employeeId: string | null;
  categoryId: string | null;
}

function one(v: string | string[] | undefined): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function parseFilters(searchParams: Record<string, string | string[] | undefined>): ReportFilters {
  return {
    from: one(searchParams.from),
    to: one(searchParams.to),
    territoryId: one(searchParams.territory),
    employeeId: one(searchParams.employee),
    categoryId: one(searchParams.category),
  };
}
