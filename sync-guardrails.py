#!/usr/bin/env python3
"""Copy the shared runtime guardrails into every agent and skill.

`guardrails/RUNTIME-POLICY.md` is the single source. This writes the block
between its markers into a matching marked region in each `agents/*.md` and
`skills/*/SKILL.md`, appending the region when a file does not have one yet.
`./validate.py` fails when any copy has drifted, so the sync is enforced rather
than remembered.

Generation rather than a runtime include: omp has no import mechanism for agent
bodies — a `.md` body becomes a system prompt verbatim. Telling each agent to go
read a policy file costs a tool call per agent on every run and can be skipped;
a generated block costs nothing at runtime and cannot be.

    ./sync-guardrails.py           # write the block into every target
    ./sync-guardrails.py --check   # exit non-zero if anything is out of date
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
SOURCE = ROOT / "guardrails" / "RUNTIME-POLICY.md"

BEGIN = "<!-- BEGIN kb-guardrails -->"
END = "<!-- END kb-guardrails -->"
GENERATED_NOTE = (
    "<!-- BEGIN kb-guardrails (generated from guardrails/RUNTIME-POLICY.md — "
    "run ./sync-guardrails.py; do not edit here) -->"
)
REGION = re.compile(
    r"<!-- BEGIN kb-guardrails.*?-->\n(.*?)\n<!-- END kb-guardrails -->", re.S)


def policy_body():
    text = SOURCE.read_text()
    start = text.index(BEGIN) + len(BEGIN)
    end = text.index(END)
    return text[start:end].strip("\n")


def targets():
    return sorted((ROOT / "agents").glob("*.md")) + \
           sorted((ROOT / "skills").glob("*/SKILL.md"))


def rendered(body):
    return f"{GENERATED_NOTE}\n{body}\n{END}"


def sync(path, body, check):
    text = path.read_text()
    block = rendered(body)
    match = REGION.search(text)
    if match:
        if match.group(1).strip("\n") == body:
            return False
        updated = text[:match.start()] + block + text[match.end():]
    else:
        if check:
            print(f"{path.relative_to(ROOT)}: missing the kb-guardrails region")
            return True
        updated = text.rstrip("\n") + "\n\n" + block + "\n"
    if check:
        print(f"{path.relative_to(ROOT)}: kb-guardrails region is out of date")
        return True
    path.write_text(updated)
    return True


def main():
    check = "--check" in sys.argv
    if not SOURCE.exists():
        sys.exit(f"missing {SOURCE.relative_to(ROOT)}")
    body = policy_body()
    if not body.strip():
        sys.exit(f"{SOURCE.relative_to(ROOT)}: guardrail region is empty")

    changed = [p for p in targets() if sync(p, body, check)]
    if check:
        if changed:
            print(f"\n{len(changed)} file(s) out of date — run ./sync-guardrails.py")
            return 1
        print(f"kb-guardrails in sync across {len(targets())} files")
        return 0
    for p in changed:
        print(f"  updated {p.relative_to(ROOT)}")
    print(f"kb-guardrails synced into {len(targets())} files "
          f"({len(changed)} changed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
