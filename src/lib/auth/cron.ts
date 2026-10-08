/**
 * Authorizes a Vercel Cron request. Vercel sends `Authorization: Bearer
 * $CRON_SECRET` automatically when the env var is set.
 *
 * Fails closed: in production a missing CRON_SECRET rejects every call, so a
 * forgotten env var can never expose the cron endpoints publicly. Outside
 * production an unset secret is allowed for local testing.
 */
export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  env: { CRON_SECRET?: string; NODE_ENV?: string } = process.env,
): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return env.NODE_ENV !== "production";
  return authorizationHeader === `Bearer ${secret}`;
}
