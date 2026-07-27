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
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("pyyaml required: pip install pyyaml")

ROOT = Path(__file__).parent
AGENTS = ROOT / "agents"
SKILLS = ROOT / "skills"
HOOKS = ROOT / "hooks"
DASHBOARD = ROOT / "dashboard"

# omp ships these; a same-named file silently overrides them. The confirmed set
# comes from ~/.omp/agent/agents/ (designer, librarian, reviewer, scout, sonic,
# task); explore/plan/oracle/quick_task are kept as a documented superset.
BUNDLED = {"explore", "plan", "designer", "reviewer", "librarian",
           "oracle", "task", "quick_task", "scout", "sonic"}
FIELDS = {"name", "description", "tools", "model", "spawns", "thinkingLevel",
          "output", "blocking", "autoloadSkills", "read-summarize", "prewalk"}
# `prewalk: true` hands the agent off to the "@smol" role at its first
# edit/write; a string names the target model or role instead. omp resolves it
# alongside the task.agentPrewalk override, so both forms are valid here.
PREWALK_DEFAULT_TARGET = True
# Roles are referenced with an "@" sigil in the model field and given as a list.
ROLES = {"@smol", "@default", "@slow", "@fast", "@task", "@designer"}
THINKING = {"minimal", "low", "medium", "high", "xhigh", "auto"}
# Tool names omp actually exposes (verified from exported agents + session logs).
TOOLS = {"read", "write", "edit", "grep", "glob", "bash", "lsp", "web_search",
         "ast_grep", "yield", "hub", "todo", "task", "advise", "web"}

# Hook events omp actually dispatches, read out of the installed binary's
# HookRunner (emit / emitToolCall / emitContext / emitBeforeAgentStart).
# `tool_call` is the only one whose return value can block a tool; `tool_result`
# and `context` can rewrite what the model sees; the rest are observational.
HOOK_EVENTS = {"session_start", "session_end", "agent_start", "agent_end",
               "turn_start", "turn_end", "context", "tool_call", "tool_result",
               "before_agent_start", "session.compacting",
               "session_before_switch", "session_before_branch",
               "session_before_compact", "session_before_tree"}

# Names the kb-* dispatch-reference regex must never flag as a missing agent,
# even though they look like one — belt-and-braces alongside kb_db.py's
# underscore (a backticked `kb-db` in a skill body would otherwise fail here).
NOT_AGENTS = {"kb-db"}

# Dead JSON artifact names the SQLite migration deleted the producers of.
# qa-e2e-results.json is raw Playwright reporter output, not a migrated
# artifact, and dashboard/state.json belongs to the unrelated vendored app.
DEAD_ARTIFACTS = re.compile(
    r"state\.json|intake\.json|todo\.json|backlog\.json|qa-report\.json|"
    r"release\.json|findings\.json|critique\.json|verdict\.json|progress/")
DEAD_ARTIFACT_EXEMPT = re.compile(r"qa-e2e-results\.json|dashboard/state\.json")

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

    # model is a list of "@"-prefixed roles (omp's own agents all use list form)
    if "model" in fm:
        roles = fm["model"] if isinstance(fm["model"], list) else [fm["model"]]
        for role in roles:
            if role not in ROLES:
                errors.append(
                    f"{path.name}: model role '{role}' is not a known role "
                    f"({', '.join(sorted(ROLES))}) — roles carry an '@' sigil")

    # tools is a list of omp tool names; the CSV form and names like search/find/
    # irc/github do not exist in omp and fail silently at dispatch.
    if "tools" in fm:
        names = (fm["tools"] if isinstance(fm["tools"], list)
                 else [t.strip() for t in str(fm["tools"]).split(",")])
        for tool in names:
            if tool and tool not in TOOLS:
                errors.append(
                    f"{path.name}: tool '{tool}' is not a known omp tool name "
                    f"({', '.join(sorted(TOOLS))})")

    if "thinkingLevel" in fm and fm["thinkingLevel"] not in THINKING:
        errors.append(f"{path.name}: invalid thinkingLevel '{fm['thinkingLevel']}'")

    # prewalk is `true` (hand off to the "@smol" role) or a model/role string.
    # A bare `false` is legal but pointless — it is the default.
    if "prewalk" in fm:
        pw = fm["prewalk"]
        if not isinstance(pw, bool) and not (isinstance(pw, str) and pw.strip()):
            errors.append(
                f"{path.name}: prewalk must be true/false or a non-empty "
                f"model-or-role string, got {pw!r}")

    # output conflicts with prose return instructions — omp docs say pick one
    if "output" in fm:
        try:
            json.dumps(fm["output"])
        except (TypeError, ValueError) as e:
            errors.append(f"{path.name}: output schema not JSON-serializable: {e}")
        # omp expects its properties/optionalProperties DSL, not JSON Schema.
        if isinstance(fm["output"], dict) and (
                "type" in fm["output"] or "required" in fm["output"]):
            errors.append(
                f"{path.name}: output uses JSON-Schema keys (type/required) — omp "
                f"expects the properties/optionalProperties DSL with per-field "
                f"metadata.description")
        if re.search(r"^Return a short prose", body, re.M):
            errors.append(
                f"{path.name}: has an output schema AND asks for a prose return "
                f"— these conflict, pick one")
        # AGENTS.md:99 — structured returns are delivered via `yield`.
        tools = fm.get("tools") or []
        tool_names = (tools if isinstance(tools, list)
                      else [t.strip() for t in str(tools).split(",")])
        if "yield" not in tool_names:
            errors.append(
                f"{path.name}: has an output schema but no 'yield' tool "
                f"(AGENTS.md:99 — structured returns are delivered via yield)")

    dead = DEAD_ARTIFACTS.findall(DEAD_ARTIFACT_EXEMPT.sub("", body))
    if dead:
        errors.append(
            f"{path.name}: references dead artifact name(s) {sorted(set(dead))} "
            f"— these were deleted by the SQLite migration; use kb_db.py "
            f"load/get instead")

    for i, block in enumerate(re.findall(r"```json\n(.*?)```", body, re.S)):
        try:
            json.loads(block)
        except json.JSONDecodeError as e:
            errors.append(f"{path.name}: JSON example {i} is invalid: {e}")

    # Any bash block invoking `kb_db.py load` with a heredoc payload is a live
    # contract example — pipe it through the real loader (--dry-run, rolled
    # back) so a stale field name fails CI instead of the next live run.
    for bash_block in re.findall(r"```bash\n(.*?)```", body, re.S):
        if "kb_db.py load" not in bash_block:
            continue
        heredoc = re.search(r"<<['\"]?(\w+)['\"]?\n(.*?)\n\1", bash_block, re.S)
        if not heredoc:
            continue
        payload = heredoc.group(2).strip()
        if not payload.startswith("{"):
            continue
        try:
            json.loads(payload)
        except json.JSONDecodeError:
            continue
        ok, msg = validate_load_payload(payload)
        if not ok:
            errors.append(f"{path.name}: `load` example does not match "
                           f"kb_db.py's real schema: {msg}")

    if len(fm.get("description", "")) < 40:
        warnings.append(
            f"{path.name}: short description — the parent reads this when "
            f"deciding whether to dispatch")

    return fm


KB_DB = ROOT / "skills" / "kanban-cycle" / "kb_db.py"


def validate_load_payload(payload_json):
    """Pipe a `load` example through the real helper, rolled back, so a stale
    section/field name in a prompt fails CI instead of the next live run."""
    if not KB_DB.exists():
        return True, "kb_db.py missing — reported separately by check_helper"
    proc = subprocess.run(
        [sys.executable, str(KB_DB), "load", "--dry-run", "--db", ":memory:"],
        input=payload_json, capture_output=True, text=True, timeout=10)
    if proc.returncode != 0:
        return False, (proc.stderr or proc.stdout).strip()
    return True, ""


def check_helper():
    """kb_db.py ships DDL + subcommands for every board agent — sanity-check
    it the same way a stale prompt example is sanity-checked: actually run it."""
    if not KB_DB.exists():
        errors.append(f"{KB_DB.relative_to(ROOT)}: missing — required by every "
                       f"board agent's load/get/set invocations")
        return
    try:
        compile(KB_DB.read_text(), str(KB_DB), "exec")
    except SyntaxError as e:
        errors.append(f"{KB_DB.relative_to(ROOT)}: does not compile: {e}")
        return
    proc = subprocess.run(
        [sys.executable, str(KB_DB), "init", "--run-dir", "/tmp/validate-selftest",
         "--base-branch", "main", "--db", ":memory:"],
        capture_output=True, text=True, timeout=10)
    if proc.returncode != 0:
        errors.append(f"{KB_DB.relative_to(ROOT)}: 'init --db :memory:' failed: "
                       f"{(proc.stderr or proc.stdout).strip()}")


def check_guardrails():
    """The shared runtime guardrails have one source; every copy must match it.

    Same principle as piping `load` examples through the real helper: a stale
    copy of a prompt rule is invisible until a live run behaves oddly, so it
    fails here instead.
    """
    sync = ROOT / "sync-guardrails.py"
    if not sync.exists():
        errors.append("sync-guardrails.py: missing — required to keep the shared "
                       "runtime guardrails in one place")
        return
    proc = subprocess.run([sys.executable, str(sync), "--check"],
                          capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        for line in (proc.stdout or proc.stderr).strip().splitlines():
            if line.strip():
                errors.append(f"guardrails: {line.strip()}")


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
    rows = []
    for path in found:
        text = path.read_text()
        if "export default" not in text:
            warnings.append(
                f"{path.relative_to(ROOT)}: hook has no `export default` — omp "
                f"loads hook modules by their default export, so this won't bind")
        # omp's real hook surfaces. Binding to an invented event loads without
        # error and then never fires, so an unknown name is a silent no-op.
        subscribed = sorted(set(re.findall(r'pi\.on\(\s*"([a-z_.]+)"', text)))
        for event in subscribed:
            if event not in HOOK_EVENTS:
                errors.append(
                    f"{path.relative_to(ROOT)}: subscribes to '{event}', which is "
                    f"not an omp hook event ({', '.join(sorted(HOOK_EVENTS))}) — it "
                    f"would load without error and never fire")
        rows.append((str(path.relative_to(ROOT)), ",".join(subscribed) or "none"))
    return rows


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
            model = fm.get("model", "inherit")
            if isinstance(model, list):
                model = ",".join(model)
            rows.append((fm.get("name", path.stem),
                         model,
                         "json" if "output" in fm else "prose"))

    # skills — discovery is non-recursive, exactly one directory deep under
    # skills/. Validate every SKILL.md, and check agent references across all of
    # them together so an agent used by any skill is not flagged unused.
    on_disk = {p.stem for p in found}
    skill_files = sorted(SKILLS.glob("*/SKILL.md"))
    if not skill_files:
        errors.append(f"no skills found under {SKILLS.relative_to(ROOT)}")
    referenced = set()
    for skill in skill_files:
        rel = skill.relative_to(ROOT)
        fm, body = frontmatter(skill)
        if not fm:
            continue
        if fm.get("name") != skill.parent.name:
            errors.append(
                f"{rel}: name '{fm.get('name')}' must match its directory "
                f"'{skill.parent.name}' — omp discovers skills by directory")
        if not fm.get("description"):
            errors.append(f"{rel}: missing description (it gates the skill)")
        refs = set(re.findall(r"`(kb-[a-z]+)`", body))
        referenced |= refs
        for missing in sorted(refs - on_disk - NOT_AGENTS):
            errors.append(f"{rel} dispatches '{missing}' but no such agent file")
    for unused in sorted(on_disk - referenced):
        warnings.append(f"{unused} exists but no skill references it")

    check_manifest()
    hooks = check_hooks()
    check_dashboard()
    check_helper()
    check_guardrails()

    if not quiet:
        w0 = max([16] + [len(n) for n, _, _ in rows] + [len(h) for h, _ in hooks]) + 2
        print(f"{'component':<{w0}}{'role':<10}{'returns'}")
        for name, model, ret in rows:
            print(f"{name:<{w0}}{model:<10}{ret}")
        for path, events in hooks:
            print(f"{path:<{w0}}{'hook':<10}{events}")
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
            n_sk = len(skill_files)
            print(f"OK — {len(rows)} agents + {n_sk} skill{'s' if n_sk != 1 else ''} valid"
                  + (f", {len(warnings)} warning(s)" if warnings else ""))

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
