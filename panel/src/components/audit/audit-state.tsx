import type { BundleValidation } from "@/server/audits/validate";
import { InvalidBundleNotice } from "./invalid-bundle-notice";

export interface AuditStateProps {
  bundleDir: string;
  validation: BundleValidation;
}

export function AuditState({ bundleDir, validation }: AuditStateProps) {
  if (validation.status !== "invalid") return null;

  return <InvalidBundleNotice bundleDir={bundleDir} validation={validation} />;
}