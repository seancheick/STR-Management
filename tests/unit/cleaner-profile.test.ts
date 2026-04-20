import { describe, expect, it } from "vitest";

import { parseCleanerProfileFormData } from "@/lib/services/cleaner-profile";

describe("parseCleanerProfileFormData", () => {
  it("normalizes optional phone and availability fields", () => {
    const formData = new FormData();
    formData.set("fullName", "  Codex Cleaner  ");
    formData.set("phone", "  555-0100  ");
    formData.set("availability", "  Providence weekdays  ");

    const result = parseCleanerProfileFormData(formData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        fullName: "Codex Cleaner",
        phone: "555-0100",
        availability: "Providence weekdays",
      });
    }
  });

  it("rejects a blank full name", () => {
    const formData = new FormData();
    formData.set("fullName", " ");
    formData.set("phone", "");
    formData.set("availability", "");

    const result = parseCleanerProfileFormData(formData);

    expect(result.success).toBe(false);
  });
});
