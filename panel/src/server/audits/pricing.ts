export type AuditPricing =
  | { available: true; pricing: string }
  | { available: false; pricing: null };

export function resolveAuditPricing(suppliedPricing: string | null | undefined): AuditPricing {
  if (!suppliedPricing?.trim()) return { available: false, pricing: null };

  return { available: true, pricing: suppliedPricing };
}