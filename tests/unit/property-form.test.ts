import { describe, expect, it } from "vitest";

import { parsePropertyFormData } from "@/lib/services/property-form";

function makeFormData(entries: Record<string, string>) {
  const formData = new FormData();

  Object.entries(entries).forEach(([key, value]) => {
    formData.set(key, value);
  });

  return formData;
}

describe("parsePropertyFormData", () => {
  it("parses a valid property payload and normalizes blank optionals to null", () => {
    const result = parsePropertyFormData(
      makeFormData({
        name: "  Lakeview Loft  ",
        addressLine1: " 123 Demo Street ",
        city: " Austin ",
        state: " tx ",
        postalCode: " 78701 ",
        bedrooms: "2",
        bathrooms: "2.5",
        defaultCleanPrice: "185.50",
        difficultyScore: "4",
        defaultCleanerId: "",
        active: "on",
      }),
    );

    expect(result).toEqual({
      name: "Lakeview Loft",
      addressLine1: "123 Demo Street",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      bedrooms: 2,
      bathrooms: 2.5,
      defaultCleanPrice: 185.5,
      difficultyScore: 4,
      defaultCleanerId: null,
      active: true,
      timezone: null,
      cleanerNotes: null,
      guestWelcomeTemplate: null,
      cleanerAccessCode: null,
    });
  });

  it("keeps a valid timezone selection", () => {
    const result = parsePropertyFormData(
      makeFormData({
        name: "Chicago Studio",
        addressLine1: "",
        city: "",
        state: "",
        postalCode: "",
        bedrooms: "",
        bathrooms: "",
        defaultCleanPrice: "",
        difficultyScore: "",
        defaultCleanerId: "",
        timezone: "America/Chicago",
      }),
    );
    expect(result.timezone).toBe("America/Chicago");
  });

  it("defaults active to false when the checkbox is absent", () => {
    const result = parsePropertyFormData(
      makeFormData({
        name: "Garden Flat",
        addressLine1: "",
        city: "",
        state: "",
        postalCode: "",
        bedrooms: "",
        bathrooms: "",
        defaultCleanPrice: "",
        difficultyScore: "",
        defaultCleanerId: "",
      }),
    );

    expect(result.active).toBe(false);
    expect(result.addressLine1).toBeNull();
    expect(result.bedrooms).toBeNull();
    expect(result.difficultyScore).toBeNull();
  });

  it("rejects an empty property name", () => {
    expect(() =>
      parsePropertyFormData(
        makeFormData({
          name: "   ",
          addressLine1: "",
          city: "",
          state: "",
          postalCode: "",
          bedrooms: "",
          bathrooms: "",
          defaultCleanPrice: "",
          difficultyScore: "",
          defaultCleanerId: "",
        }),
      ),
    ).toThrowError();
  });

  it("rejects invalid numeric values", () => {
    expect(() =>
      parsePropertyFormData(
        makeFormData({
          name: "Broken Numbers",
          addressLine1: "",
          city: "",
          state: "",
          postalCode: "",
          bedrooms: "-1",
          bathrooms: "two",
          defaultCleanPrice: "free",
          difficultyScore: "11",
          defaultCleanerId: "",
        }),
      ),
    ).toThrowError();
  });
});
