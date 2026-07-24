#!/usr/bin/env python3
"""Validate omp-kanban agent and skill definitions.

Checks frontmatter against omp's documented subagent schema, catches the
failure modes that fail silently at runtime, and verifies every agent the
skill dispatches actually exists.

    ./validate.py          # validate, print a summary
    ./validate.py -q       # exit code only
"""
import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("pyyaml required: pip install pyyaml")

ROOT = Path(__file__).parent
AGENTS = ROOT / "agents"
SKILL = ROOT / "skills" / "kanban-cycle" / "SKILL.md"
HOOKS = ROOT / "hooks"
DASHBOARD = ROOT / "dashboard"

# omp ships these; a same-named file silently overrides them.
BUNDLED = {"explore", "plan", "designer", "reviewer",
           "librarian", "oracle", "task", "quick_task"}
FIELDS = {"name", "description", "tools", "model", "spawns", "thinkingLevel",
          "output", "blocking", "autoloadSkills", "read-summarize"}
ROLES = {"smol", "default", "slow", "plan", "commit"}
THINKING = {"minimal", "low", "medium", "high", "xhigh"}

errors, warnings = [], []


def frontmatter(path):
    text = path.read_text()
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        errors.append(f"{path.name}: no frontmatter block")
        return None, text
    try:
        return yaml.safe_load(m.group(1)), text[m.end():]
    except yaml.YAMLError as e:
        errors.append(f"{path.name}: frontmatter is not valid YAML: {e}")
        return None, text


def check_agent(path):
    fm, body = frontmatter(path)
    if fm is None:
        return None
    stem = path.stem

    for req in ("name", "description"):
        if not fm.get(req):
            errors.append(f"{path.name}: missing required field '{req}'")

    if fm.get("name") != stem:
        errors.append(
            f"{path.name}: name '{fm.get('name')}' does not match filename "
            f"'{stem}' — omp resolves by the name field, so this is confusing")

    if fm.get("name") in BUNDLED:
        errors.append(
            f"{path.name}: name collides with bundled agent '{fm.get('name')}' "
            f"— it would silently override omp's own")

    for key in fm:
        if key not in FIELDS:
            errors.append(f"{path.name}: unknown frontmatter field '{key}'")

    if "model" in fm and fm["model"] not in ROLES:
        errors.append(
            f"{path.name}: model '{fm['model']}' is not a role "
            f"({', '.join(sorted(ROLES))})")

    if "thinkingLevel" in fm and fm["thinkingLevel"] not in THINKING:
        errors.append(f"{path.name}: invalid thinkingLevel '{fm['thinkingLevel']}'")

    # output conflicts with prose return instructions — omp docs say pick one
    if "output" in fm:
        try:
            json.dumps(fm["output"])
        except (TypeError, ValueError) as e:
            errors.append(f"{path.name}: output schema not JSON-serializable: {e}")
        if re.search(r"^Return a short prose", body, re.M):
            errors.append(
                f"{path.name}: has an output schema AND asks for a prose return "
                f"— these conflict, pick one")

    for i, block in enumerate(re.findall(r"```json\n(.*?)```", body, re.S)):
        try:
            json.loads(block)
        except json.JSONDecodeError as e:
            errors.append(f"{path.name}: JSON example {i} is invalid: {e}")

    if len(fm.get("description", "")) < 40:
        warnings.append(
            f"{path.name}: short description — the parent reads this when "
            f"deciding whether to dispatch")

    return fm


def check_manifest():
    """Validate package.json against omp's plugin manifest expectations."""
    path = ROOT / "package.json"
    if not path.exists():
        warnings.append(
            "no package.json — required to install via `omp plugin install`, "
            "though install.sh works without it")
        return
    try:
        pkg = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        errors.append(f"package.json: invalid JSON: {e}")
        return

    if "pi" in pkg and "omp" not in pkg:
        warnings.append(
            "package.json uses the legacy 'pi' key; omp resolves 'omp' first "
            "and only falls back to 'pi'")

    omp = pkg.get("omp")
    if omp is None:
        errors.append(
            "package.json: missing the 'omp' key — omp plugin install expects it")
        return
    if not isinstance(omp, dict):
        errors.append("package.json: 'omp' must be an object")
        return

    # omp.extensions is the only field omp reads. It must be an array of entry
    # paths; other keys (hooks, commands) resolve but are not wired to a runtime
    # registry, so declaring capabilities there silently does nothing.
    if "extensions" not in omp:
        errors.append(
            "package.json: 'omp.extensions' missing — omp plugin install "
            "expects the key even when empty")
    elif not isinstance(omp["extensions"], list):
        errors.append(
            f"package.json: 'omp.extensions' must be an array, got "
            f"{type(omp['extensions']).__name__}")
    else:
        for entry in omp["extensions"]:
            if not (ROOT / entry).exists():
                errors.append(
                    f"package.json: omp.extensions entry '{entry}' does not exist")

    for unwired in ("hooks", "commands", "tools", "agents", "skills"):
        if unwired in omp:
            warnings.append(
                f"package.json: 'omp.{unwired}' is not a field omp reads — "
                f"capabilities are discovered by directory name, and this key "
                f"will be silently ignored")


def check_hooks():
    """Hooks are optional. When present, omp loads hooks/{pre,post}/*.ts as
    extension modules by their default export — so warn if one is missing it."""
    if not HOOKS.is_dir():
        return []
    found = sorted(HOOKS.glob("*/*.ts"))
    for path in found:
        if "export default" not in path.read_text():
            warnings.append(
                f"{path.relative_to(ROOT)}: hook has no `export default` — omp "
                f"loads hook modules by their default export, so this won't bind")
    return [str(p.relative_to(ROOT)) for p in found]


def check_dashboard():
    """The vendored dashboard is optional. If present, its entry points must be
    intact — node_modules and web/dist are built at install time, not required."""
    if not DASHBOARD.is_dir():
        return
    for req in ("server/src/index.js", "package.json"):
        if not (DASHBOARD / req).exists():
            errors.append(
                f"dashboard/: missing {req} — the vendored app looks incomplete")


def main():
    quiet = "-q" in sys.argv

    if not AGENTS.is_dir():
        sys.exit(f"no agents directory at {AGENTS}")

    found = sorted(AGENTS.glob("*.md"))
    if not found:
        sys.exit(f"no agent files in {AGENTS}")

    rows = []
    for path in found:
        fm = check_agent(path)
        if fm:
            rows.append((fm.get("name", path.stem),
                         fm.get("model", "inherit"),
                         "json" if "output" in fm else "prose"))

    # skill
    if not SKILL.exists():
        errors.append(f"missing skill at {SKILL.relative_to(ROOT)}")
    else:
        fm, body = frontmatter(SKILL)
        if fm:
            if fm.get("name") != "kanban-cycle":
                errors.append("SKILL.md: name should be 'kanban-cycle'")
            if not fm.get("description"):
                errors.append("SKILL.md: missing description (it gates the skill)")
            referenced = set(re.findall(r"`(kb-[a-z]+)`", body))
            on_disk = {p.stem for p in found}
            for missing in sorted(referenced - on_disk):
                errors.append(f"SKILL.md dispatches '{missing}' but no such agent file")
            for unused in sorted(on_disk - referenced):
                warnings.append(f"{unused} exists but the skill never references it")

    check_manifest()
    hooks = check_hooks()
    check_dashboard()

    if not quiet:
        w0 = max([16] + [len(n) for n, _, _ in rows] + [len(h) for h in hooks]) + 2
        print(f"{'component':<{w0}}{'role':<10}{'returns'}")
        for name, model, ret in rows:
            print(f"{name:<{w0}}{model:<10}{ret}")
        for h in hooks:
            print(f"{h:<{w0}}{'hook':<10}session_start")
        if DASHBOARD.is_dir():
            print(f"{'dashboard/':<{w0}}{'app':<10}vendored web app")
        print()
        for w in warnings:
            print(f"warning: {w}")
        if errors:
            for e in errors:
                print(f"ERROR: {e}")
            print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
        else:
            print(f"OK — {len(rows)} agents + skill valid"
                  + (f", {len(warnings)} warning(s)" if warnings else ""))

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
