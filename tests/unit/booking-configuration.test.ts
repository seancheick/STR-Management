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
