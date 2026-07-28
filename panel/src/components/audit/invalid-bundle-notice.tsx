import type { BundleValidation } from "@/server/audits/validate";

type InvalidBundleValidation = Extract<BundleValidation, { status: "invalid" }>;

export interface InvalidBundleNoticeProps {
  bundleDir: string;
  validation: InvalidBundleValidation;
}

const artifactFilenames = ["manifest.json", "audit.json", "report.md", "evidence.jsonl"];

function artifactPath(bundleDir: string, filename: string) {
  return `${bundleDir.replace(/\/$/, "")}/${filename}`;
}

export function InvalidBundleNotice({ bundleDir, validation }: InvalidBundleNoticeProps) {
  const canRerun = validation.manifest !== null;

  return (
    <section aria-labelledby="invalid-audit-output-heading">
      <h2 id="invalid-audit-output-heading">Invalid audit output</h2>
      <div role="alert">
        {validation.issues.map((issue) => (
          <p key={`${issue.file}:${issue.location}`}>
            Invalid audit output: {issue.file}, {issue.location}. {issue.message}
          </p>
        ))}
      </div>
      <p>Findings are unavailable because this output did not pass validation.</p>
      <h3>Artifacts available for manual inspection</h3>
      <ul>
        {artifactFilenames.map((filename) => (
          <li key={filename}>
            <code>{artifactPath(bundleDir, filename)}</code>
          </li>
        ))}
      </ul>
      <p>
        {canRerun
          ? "You can rerun this audit from its session."
          : "A rerun is unavailable because the audit target could not be verified."}
      </p>
    </section>
  );
}