export type AuditEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

export function assessAuditEligibility(transcript: string | null): AuditEligibility {
  if (transcript === null) {
    return { eligible: false, reason: "The session transcript could not be read." };
  }

  if (!transcript.trim()) {
    return { eligible: false, reason: "The session transcript is empty." };
  }

  return { eligible: true };
}