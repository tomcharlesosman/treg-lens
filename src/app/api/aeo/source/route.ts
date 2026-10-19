import { AeoError, aeoErrorResponse } from "@/lib/aeo";
import {
  assertPublicDns,
  estimateSource,
  readToolRequest,
  researchSource,
  validateSourceInput,
} from "@/lib/source-research";
import { authorizePaidInput, authErrorResponse } from "@/lib/treg-auth";
import { TregAuthError } from "@/lib/treg-session";

export const maxDuration = 120;
let active = 0;
const recent = new Map<string, number>();

export async function POST(request: Request) {
  let acquired = false;
  try {
    const parsed = validateSourceInput(await readToolRequest(request));
    if (parsed.estimateOnly)
      return Response.json(await estimateSource(), {
        headers: { "Cache-Control": "no-store" },
      });
    const input = await authorizePaidInput(parsed);
    const now = Date.now();
    for (const [key, timestamp] of recent)
      if (timestamp < now - 60_000) recent.delete(key);
    const key =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (active >= 3 || (recent.get(key) ?? 0) > now - 5000)
      throw new AeoError(
        "A source lookup was just started. Wait a moment before trying again.",
        429,
      );
    await assertPublicDns(input.url);
    active += 1;
    acquired = true;
    recent.set(key, now);
    return Response.json(await researchSource(input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TregAuthError) return authErrorResponse(error);
    return aeoErrorResponse(error);
  } finally {
    if (acquired) active -= 1;
  }
}
