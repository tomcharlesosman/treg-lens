import { timingSafeEqual } from "node:crypto";

/** Missing, empty, or short cron configuration never grants runner access. */
export function authorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer ")) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
