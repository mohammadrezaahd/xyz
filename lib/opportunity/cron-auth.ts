export function isCronAuthorized(
  authorizationHeader: string | null,
  cronSecret: string | undefined,
): boolean {
  const secret = cronSecret?.trim();
  return Boolean(secret) && authorizationHeader === `Bearer ${secret}`;
}
