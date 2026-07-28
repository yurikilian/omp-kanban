"use client";

export interface PricingPromptProps {
  pricing: string;
  onPricingChange(pricing: string): void;
}

export function PricingPrompt({ pricing, onPricingChange }: PricingPromptProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="audit-pricing" className="text-sm font-medium">
        Optional pricing
      </label>
      <textarea
        id="audit-pricing"
        value={pricing}
        onChange={(event) => onPricingChange(event.target.value)}
        aria-describedby="audit-pricing-description"
        className="rounded-md border bg-background px-3 py-1.5 text-sm"
      />
      <p id="audit-pricing-description" className="text-sm text-muted-foreground">
        Leave blank to generate a token-only audit. Pricing will be marked unavailable.
      </p>
    </div>
  );
}