"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  type PropertyActionState,
} from "@/app/(admin)/dashboard/properties/actions";
import type { PropertyRecord } from "@/lib/queries/properties";

function generateAccessCode(): string {
  // 4-digit code avoiding obvious patterns (0000, 1234, 1111)
  for (let i = 0; i < 16; i++) {
    const n = Math.floor(Math.random() * 10000);
    const s = n.toString().padStart(4, "0");
    if (/(.)\1{3}/.test(s)) continue; // reject aaaa
    if (/0123|1234|2345|3456|4567|5678|6789/.test(s)) continue; // reject sequential
    return s;
  }
  return Math.floor(Math.random() * 10000).toString().padStart(4, "0");
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return Number.isFinite(days) ? days : null;
}

type PropertyFormProps = {
  action: (
    state: PropertyActionState,
    formData: FormData,
  ) => Promise<PropertyActionState>;
  property?: PropertyRecord | null;
  submitLabel: string;
};

const initialPropertyActionState: PropertyActionState = {
  status: "idle",
  message: null,
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-[#f7f5ef] transition hover:opacity-95 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="text-sm text-destructive">{errors[0]}</p>;
}

export function PropertyForm({ action, property, submitLabel }: PropertyFormProps) {
  const [state, formAction] = useActionState(action, initialPropertyActionState);
  const [accessCode, setAccessCode] = useState<string>(
    property?.cleaner_access_code ?? "",
  );
  const codeAge = daysSince(property?.cleaner_access_code_set_at ?? null);
  const isStale = codeAge !== null && codeAge >= 90;

  return (
    <form action={formAction} className="space-y-8">
      <input name="defaultCleanerId" type="hidden" value={property?.default_cleaner_id ?? ""} />

      <section className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="name">
            Property name
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.name ?? ""}
            id="name"
            name="name"
            placeholder="Lakeview Loft"
            required
          />
          <FieldError errors={state.fieldErrors?.name} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="addressLine1">
            Address
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.address_line_1 ?? ""}
            id="addressLine1"
            name="addressLine1"
            placeholder="123 Demo Street"
          />
          <FieldError errors={state.fieldErrors?.addressLine1} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="city">
            City
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.city ?? ""}
            id="city"
            name="city"
            placeholder="Austin"
          />
          <FieldError errors={state.fieldErrors?.city} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="state">
            State
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm uppercase"
            defaultValue={property?.state ?? ""}
            id="state"
            name="state"
            placeholder="TX"
          />
          <FieldError errors={state.fieldErrors?.state} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="postalCode">
            Postal code
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.postal_code ?? ""}
            id="postalCode"
            name="postalCode"
            placeholder="78701"
          />
          <FieldError errors={state.fieldErrors?.postalCode} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="bedrooms">
            Bedrooms
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.bedrooms ?? ""}
            id="bedrooms"
            min="0"
            name="bedrooms"
            step="1"
            type="number"
          />
          <FieldError errors={state.fieldErrors?.bedrooms} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="bathrooms">
            Bathrooms
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.bathrooms ?? ""}
            id="bathrooms"
            min="0"
            name="bathrooms"
            step="0.5"
            type="number"
          />
          <FieldError errors={state.fieldErrors?.bathrooms} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="defaultCleanPrice">
            Default clean price
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.default_clean_price ?? ""}
            id="defaultCleanPrice"
            min="0"
            name="defaultCleanPrice"
            step="0.01"
            type="number"
          />
          <FieldError errors={state.fieldErrors?.defaultCleanPrice} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="difficultyScore">
            Difficulty score
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.difficulty_score ?? ""}
            id="difficultyScore"
            max="5"
            min="1"
            name="difficultyScore"
            step="1"
            type="number"
          />
          <FieldError errors={state.fieldErrors?.difficultyScore} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="timezone">
            Timezone
            <span className="ml-2 font-normal text-muted-foreground">
              (controls iCal check-in / checkout snapping; leave blank to use app default)
            </span>
          </label>
          <select
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.timezone ?? ""}
            id="timezone"
            name="timezone"
          >
            <option value="">Use app default (America/New_York)</option>
            <option value="America/New_York">Eastern — America/New_York</option>
            <option value="America/Chicago">Central — America/Chicago</option>
            <option value="America/Denver">Mountain — America/Denver</option>
            <option value="America/Phoenix">Arizona (no DST) — America/Phoenix</option>
            <option value="America/Los_Angeles">Pacific — America/Los_Angeles</option>
            <option value="America/Anchorage">Alaska — America/Anchorage</option>
            <option value="Pacific/Honolulu">Hawaii — Pacific/Honolulu</option>
          </select>
          <FieldError errors={state.fieldErrors?.timezone} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="cleanerAccessCode">
            Cleaner&apos;s door code
            <span className="ml-2 font-normal text-muted-foreground">
              (the permanent code you set on this property&apos;s lock)
            </span>
          </label>
          <div className="flex gap-2">
            <input
              autoComplete="off"
              className="h-12 flex-1 rounded-xl border border-input bg-background px-4 font-mono text-base tracking-widest"
              id="cleanerAccessCode"
              maxLength={16}
              name="cleanerAccessCode"
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="e.g. 4287"
              type="text"
              value={accessCode}
            />
            <button
              className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-border/70 bg-card px-4 text-xs font-medium transition hover:border-primary/40 hover:bg-muted"
              onClick={() => setAccessCode(generateAccessCode())}
              type="button"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Generate
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Type this into your Yale / August / Schlage app so the lock accepts it,
            then save here. Every cleaner job for this property will show this code.
            {codeAge !== null && (
              <>
                {" "}
                <span className={isStale ? "font-semibold text-amber-700" : ""}>
                  Last changed {codeAge === 0 ? "today" : `${codeAge} days ago`}
                  {isStale && " — consider rotating"}.
                </span>
              </>
            )}
          </p>
          <FieldError errors={state.fieldErrors?.cleanerAccessCode} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="cleanerNotes">
            Notes for the cleaner
            <span className="ml-2 font-normal text-muted-foreground">
              (shown at the top of the job — WiFi, lockbox code, linen closet, quirks)
            </span>
          </label>
          <textarea
            className="min-h-28 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm"
            defaultValue={property?.cleaner_notes ?? ""}
            id="cleanerNotes"
            name="cleanerNotes"
            placeholder={`Example:\nWiFi: Lakeview-Guest / PW: 55Lake!\nLockbox: right of the door, code 4287\nLinens: top shelf of hallway closet\nTrash day: Tuesday morning, bins in garage`}
            rows={5}
          />
          <FieldError errors={state.fieldErrors?.cleanerNotes} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="guestWelcomeTemplate">
            Guest welcome template
            <span className="ml-2 font-normal text-muted-foreground">
              (for the arrival message you send guests — WiFi, gate code, quiet hours)
            </span>
          </label>
          <textarea
            className="min-h-28 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm"
            defaultValue={property?.guest_welcome_template ?? ""}
            id="guestWelcomeTemplate"
            name="guestWelcomeTemplate"
            placeholder={`Hi [guest name]! Welcome to [property]. Your check-in is any time after 3pm.\n\nGate code: 1234\nWiFi: Lakeview-Guest / PW: 55Lake!\nQuiet hours: 10pm – 8am\n\nText me at [phone] if anything comes up.`}
            rows={5}
          />
          <FieldError errors={state.fieldErrors?.guestWelcomeTemplate} />
        </div>
      </section>

      <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3">
        <input
          defaultChecked={property?.active ?? true}
          name="active"
          type="checkbox"
          value="on"
        />
        <span className="text-sm text-foreground">Property is active</span>
      </label>

      {state.message ? (
        <p
          className={
            state.status === "error" ? "text-sm text-destructive" : "text-sm font-medium text-green-700"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
