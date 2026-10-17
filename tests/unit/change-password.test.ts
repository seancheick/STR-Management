import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), updateUser: vi.fn(), verify: vi.fn(), signOut: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => ({ auth: { getUser: mocks.getUser, updateUser: mocks.updateUser } }) }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public" }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { signInWithPassword: mocks.verify, signOut: mocks.signOut } }) }));
import { changePassword } from "@/lib/auth/change-password";

describe("shared password changes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { email: "cleaner@example.com" } }, error: null });
    mocks.verify.mockResolvedValue({ error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });
  it("does not update a password when the current password is wrong", async () => {
    mocks.verify.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    expect((await changePassword("wrong", "new-password")).error).toContain("current password");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("requires an authenticated account", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await changePassword("old", "new-password")).error).toContain("sign in again");
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("updates the signed-in account and cleans up only the temporary session", async () => {
    expect(await changePassword("old-password", "new-password")).toEqual({ error: null });
    expect(mocks.verify).toHaveBeenCalledWith({ email: "cleaner@example.com", password: "old-password" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "new-password", current_password: "old-password" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("preserves provider errors and cleans up verification after a failed update", async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: "Password is too weak" } });
    expect(await changePassword("old", "new")).toEqual({ error: "Password is too weak" });
    expect(mocks.signOut).toHaveBeenCalled();
  });
});
