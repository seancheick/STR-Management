import { describe, expect, it } from "vitest";

import {
  REMEMBERED_EMAIL_KEY,
  getRememberedEmail,
  saveRememberedEmail,
} from "@/lib/auth/remembered-credentials";

class MemoryStorage implements Pick<Storage, "getItem" | "removeItem" | "setItem"> {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("remembered credentials", () => {
  it("saves a trimmed lowercase email when remember is enabled", () => {
    const storage = new MemoryStorage();

    saveRememberedEmail("  CODEx-Smoke-Admin@Airbnb-Ops.Local  ", true, storage);

    expect(storage.getItem(REMEMBERED_EMAIL_KEY)).toBe("codex-smoke-admin@airbnb-ops.local");
    expect(getRememberedEmail(storage)).toBe("codex-smoke-admin@airbnb-ops.local");
  });

  it("clears the remembered email when remember is disabled", () => {
    const storage = new MemoryStorage();
    storage.setItem(REMEMBERED_EMAIL_KEY, "cleaner@example.com");

    saveRememberedEmail("cleaner@example.com", false, storage);

    expect(getRememberedEmail(storage)).toBeNull();
  });
});
