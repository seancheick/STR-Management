import { describe, expect, it } from "vitest";
import { withListingConfiguration } from "../../src/lib/services/booking-configuration";
describe("booked bedroom configuration", () => {
  it("preserves physical job identity but shows the 3-bedroom listing and its rate", () => {
    const job = {
      property_id: "floor",
      listing_property_id: "three-bed",
      properties: { name: "2 bedrooms" },
      listing_properties: { name: "3 bedrooms" },
      fixed_payout_amount: 120,
    };
    expect(withListingConfiguration(job)).toMatchObject({
      property_id: "floor",
      listing_property_id: "three-bed",
      properties: { name: "3 bedrooms" },
      fixed_payout_amount: 120,
    });
  });
  it("keeps legacy/manual display when there is no alternate listing", () => {
    const job = { properties: { name: "Basement · 1 bedroom" } };
    expect(withListingConfiguration(job)).toBe(job);
  });
});

 it("prefers corrected scope and preserves booked identity and financial history",()=>{
 const result=withListingConfiguration({properties:{name:"Physical"},listing_properties:{name:"2 bedrooms"},cleaning_scope_properties:{name:"3 bedrooms"},listing_property_id:"booked",cleaning_scope_total:120,fixed_payout_amount:90});
 expect(result.properties.name).toBe("3 bedrooms");expect(result.listing_property_id).toBe("booked");expect(result.fixed_payout_amount).toBe(120);expect(result.financial_base_amount).toBe(90);
 expect(withListingConfiguration(result).financial_base_amount).toBe(90);
 });
