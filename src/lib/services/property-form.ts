import { propertyFormSchema } from "@/lib/validations/property";

export function parsePropertyFormData(formData: FormData) {
  return propertyFormSchema.parse({
    name: formData.get("name"),
    addressLine1: formData.get("addressLine1"),
    city: formData.get("city"),
    state: formData.get("state"),
    postalCode: formData.get("postalCode"),
    bedrooms: formData.get("bedrooms"),
    bathrooms: formData.get("bathrooms"),
    defaultCleanPrice: formData.get("defaultCleanPrice"),
    difficultyScore: formData.get("difficultyScore"),
    defaultCleanerId: formData.get("defaultCleanerId"),
    active: formData.get("active") === "on",
    timezone: formData.get("timezone"),
    cleanerNotes: formData.get("cleanerNotes"),
    guestWelcomeTemplate: formData.get("guestWelcomeTemplate"),
    cleanerAccessCode: formData.get("cleanerAccessCode"),
  });
}

