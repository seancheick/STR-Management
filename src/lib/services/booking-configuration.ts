/** Actual cleaning scope overrides the booked listing without changing reservation identity. */
export function withListingConfiguration<P, T extends { properties: P; listing_properties?: P; cleaning_scope_properties?: P; cleaning_scope_total?: number | null; fixed_payout_amount?: number | null; financial_base_amount?: number | null }>(row: T): T & { financial_base_amount?: number | null } {
  if (!row.cleaning_scope_properties && !row.listing_properties && row.cleaning_scope_total == null) return row;
  return { ...row, properties: row.cleaning_scope_properties ?? row.listing_properties ?? row.properties,
    ...(row.cleaning_scope_total != null ? { financial_base_amount: row.financial_base_amount ?? row.fixed_payout_amount, fixed_payout_amount: row.cleaning_scope_total } : {}) };
}
