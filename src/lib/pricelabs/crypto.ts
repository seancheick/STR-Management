import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const value = process.env.PRICELABS_ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(value)) throw new Error("Invalid PriceLabs encryption configuration");
  return Buffer.from(value, "hex");
}
export function encryptSecret(ownerId: string, purpose: string, value: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(JSON.stringify([ownerId, purpose])));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptSecret(ownerId: string, purpose: string, value: string) {
  const [version, nonce, tag, ciphertext, extra] = value.split(".");
  if (version !== "v1" || !nonce || !tag || !ciphertext || extra) throw new Error("Invalid encrypted PriceLabs value");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(nonce, "base64url"));
  decipher.setAAD(Buffer.from(JSON.stringify([ownerId, purpose])));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
