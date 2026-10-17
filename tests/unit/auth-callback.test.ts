import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ auth }) }));
import { GET } from "@/app/auth/callback/route";
const location = async (query: string) => (await GET(new Request(`http://localhost:3000/auth/callback${query}`))).headers.get("location");
describe("auth callback recovery routing", () => {
  beforeEach(() => { vi.resetAllMocks(); auth.exchangeCodeForSession.mockResolvedValue({error:null}); auth.verifyOtp.mockResolvedValue({error:null}); });
  it("verifies an emailed recovery token without a browser PKCE verifier", async () => {
    expect(await location("?next=/reset-password&type=recovery&token_hash=test-token")).toBe("http://localhost:3000/reset-password");
    expect(auth.verifyOtp).toHaveBeenCalledWith({type:"recovery",token_hash:"test-token"});
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("keeps expired recovery links on the recovery screen", async () => {
    auth.verifyOtp.mockResolvedValue({error:{message:"Token expired"}});
    expect(await location("?next=/reset-password&type=recovery&token_hash=expired")).toBe("http://localhost:3000/reset-password?authError=link_invalid");
  });
  it("explains old cross-browser PKCE failures on the reset page", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({error:{message:"Missing verifier"}});
    expect(await location("?next=/reset-password&code=old-code")).toBe("http://localhost:3000/reset-password?authError=link_invalid");
  });
  it("keeps provider recovery errors off the sign-in page", async () => {
    expect(await location("?next=/reset-password&error=access_denied&error_description=expired")).toBe("http://localhost:3000/reset-password?authError=link_expired");
  });
  it("preserves regular authentication callbacks", async () => {
    expect(await location("?next=/dashboard/settings&code=normal")).toBe("http://localhost:3000/dashboard/settings");
  });
  it("does not permit an external redirect destination", async () => {
    expect(await location("?next=https://evil.example&code=normal")).toBe("http://localhost:3000/dashboard");
  });
});
