import { z } from "zod";

function nullableTrimmedString() {
  return z.preprocess((value) => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().nullable());
}

function nullableNumber(options?: { integer?: boolean; min?: number; max?: number }) {
  return z.preprocess((value) => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? trimmed : parsed;
  }, (() => {
    let schema = z.number();

    if (options?.integer) {
      schema = schema.int();
    }

    if (typeof options?.min === "number") {
      schema = schema.min(options.min);
    }

    if (typeof options?.max === "number") {
      schema = schema.max(options.max);
    }

    return schema.nullable();
  })());
}

export const propertyFormSchema = z.object({
  name: z.string().trim().min(1, "Property name is required."),
  addressLine1: nullableTrimmedString(),
  city: nullableTrimmedString(),
  state: z.preprocess((value) => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.toUpperCase() : null;
  }, z.string().max(32).nullable()),
  postalCode: nullableTrimmedString(),
  bedrooms: nullableNumber({ integer: true, min: 0 }),
  bathrooms: nullableNumber({ min: 0 }),
  defaultCleanPrice: nullableNumber({ min: 0 }),
  difficultyScore: nullableNumber({ integer: true, min: 1, max: 5 }),
  defaultCleanerId: nullableTrimmedString(),
  active: z.boolean(),
});

export type PropertyFormValues = z.infer<typeof propertyFormSchema>;

