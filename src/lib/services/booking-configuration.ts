/** The booked listing supplies cleaner-facing scope; property_id stays operational. */
export function withListingConfiguration<
  P,
  T extends { properties: P; listing_properties?: P },
>(row: T): T {
  return row.listing_properties
    ? { ...row, properties: row.listing_properties }
    : row;
}
