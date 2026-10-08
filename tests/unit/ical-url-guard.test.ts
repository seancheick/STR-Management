import { describe, expect, it } from "vitest";

import { assertPublicHttpsUrl, isPrivateAddress } from "@/lib/ical/url-guard";

const resolvesTo =
  (...addresses: string[]) =>
  async () =>
    addresses;

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["54.230.1.1", "2606:4700::1111"])("allows public %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("assertPublicHttpsUrl", () => {
  it("accepts a public https calendar URL", async () => {
    const url = await assertPublicHttpsUrl(
      "https://www.airbnb.com/calendar/ical/123.ics?s=abc",
      resolvesTo("54.230.1.1"),
    );
    expect(url.hostname).toBe("www.airbnb.com");
  });

  it.each([
    ["http://www.airbnb.com/x.ics", /https/],
    ["file:///etc/passwd", /https/],
    ["https://user:pw@example.com/x.ics", /username/],
    ["https://127.0.0.1/x.ics", /private/],
    ["https://[::1]/x.ics", /private/],
    ["https://169.254.169.254/latest/meta-data", /private/],
    ["not a url", /valid/],
  ])("rejects %s", async (raw, message) => {
    await expect(assertPublicHttpsUrl(raw, resolvesTo("54.230.1.1"))).rejects.toThrow(message);
  });

  it("rejects a public-looking hostname that resolves to a private address", async () => {
    await expect(
      assertPublicHttpsUrl("https://evil.example.com/x.ics", resolvesTo("54.230.1.1", "10.0.0.5")),
    ).rejects.toThrow(/private/);
  });

  it("rejects a host that does not resolve", async () => {
    await expect(
      assertPublicHttpsUrl("https://nope.invalid/x.ics", async () => {
        throw new Error("ENOTFOUND");
      }),
    ).rejects.toThrow(/find/);
  });
});
