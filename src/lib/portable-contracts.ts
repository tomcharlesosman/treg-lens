/** Migration-only cost representation. This does not execute or settle native billing. */
export type PortableCostInput = {
  reportedUsd: string | number | null;
  knownSubtotalUsd?: string | number | null;
  costKnown?: boolean;
};
export type PortableCost = {
  currency: "USD";
  reportedUsd: string | null;
  reportedKnownSubtotalUsd: string | null;
  costKnown: boolean | null;
  knownSubtotalMicroUsd: string | null;
  totalMicroUsd: string | null;
  rounded: boolean;
};

const MAX_MICRO_USD = BigInt("9223372036854775807");
function decimalMicroUsd(value: string | number | null): { raw: string | null; micro: string | null; rounded: boolean } {
  if (value === null) return { raw: null, micro: null, rounded: false };
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Invalid nonnegative USD amount.");
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) throw new Error("Invalid nonnegative USD amount.");
  const raw = String(value);
  if (raw.length > 120) throw new Error("Invalid nonnegative USD amount.");
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw);
  if (!match) throw new Error("Invalid nonnegative USD amount.");
  const exponent = Number(match[3] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) throw new Error("Invalid nonnegative USD amount.");
  const digits = BigInt(match[1] + (match[2] ?? ""));
  const scale = 6 + exponent - (match[2]?.length ?? 0);
  let amount: bigint, rounded = false;
  if (scale >= 0) amount = digits * (BigInt(10) ** BigInt(scale));
  else {
    const divisor = BigInt(10) ** BigInt(-scale);
    const remainder = digits % divisor;
    rounded = remainder !== BigInt(0);
    amount = digits / divisor + (remainder * BigInt(2) >= divisor ? BigInt(1) : BigInt(0));
  }
  if (amount > MAX_MICRO_USD) throw new Error("USD amount exceeds signed 64-bit micro-USD storage.");
  return { raw, micro: amount.toString(), rounded };
}

/** Decimal arithmetic; half-up only at sub-micro precision. Missing knowledge remains null. */
export function portableCost(input: PortableCostInput): PortableCost {
  if (input.costKnown !== undefined && typeof input.costKnown !== "boolean") throw new Error("Cost knowledge must be an explicit boolean or omitted.");
  const reported = decimalMicroUsd(input.reportedUsd);
  const subtotal = decimalMicroUsd(input.knownSubtotalUsd === undefined ? input.reportedUsd : input.knownSubtotalUsd);
  if (input.costKnown === true && reported.micro === null) throw new Error("A known total requires a reported USD amount.");
  if (input.costKnown === true && subtotal.micro !== null && BigInt(subtotal.micro) > BigInt(reported.micro!)) throw new Error("Known subtotal cannot exceed a known total.");
  return { currency: "USD", reportedUsd: reported.raw, reportedKnownSubtotalUsd: subtotal.raw,
    costKnown: input.costKnown ?? null, knownSubtotalMicroUsd: subtotal.micro,
    totalMicroUsd: input.costKnown === true ? reported.micro : null, rounded: reported.rounded || subtotal.rounded };
}
