#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

EXPECTED_AGENTS = [
    "planner",
    "ui-designer",
    "fullstack-dev",
    "qa-tester",
    "code-reviewer",
]
EXPECTED_PROFILES = ["fullstack-web", "backend", "ai-app"]
EXPECTED_SCRIPTS = [
    "scripts/setup-machine.sh",
    "scripts/bootstrap.sh",
    "scripts/verify.sh",
    "scripts/smoke-test.sh",
    "scripts/lib/common.sh",
    "scripts/lib/starter_check.py",
]
REQUIRED_DOCS = [
    "README.md",
    "docs/workflow.md",
    ".gitignore",
    ".gitattributes",
    ".cursor/rules/skill-routing.mdc",
    ".cursor/project-profile.json",
]
PROFILE_KEYS = {
    "schemaVersion",
    "id",
    "title",
    "agents",
    "optionalAgents",
    "skills",
    "hidesGlobalSkills",
}
SKILL_KEYS = {"id", "required", "paths", "when", "browserRequired"}
WHEN_VALUES = {"react", "api", "ui", "browser"}
AGENT_KEYS = {"name", "description", "model", "readonly", "is_background"}
PROFILE_CONTRACT = {
    "fullstack-web": {
        "agents": ["planner", "ui-designer", "fullstack-dev", "qa-tester", "code-reviewer"],
        "optionalAgents": [],
        "required": {
            "spec-kit",
            "api-and-interface-design",
            "test-driven-development",
            "code-review-and-quality",
            "design-taste-frontend",
            "playwright-cli",
        },
        "optional": {"vercel-react-best-practices"},
    },
    "backend": {
        "agents": ["planner", "fullstack-dev", "qa-tester", "code-reviewer"],
        "optionalAgents": [],
        "required": {
            "spec-kit",
            "api-and-interface-design",
            "test-driven-development",
            "code-review-and-quality",
        },
        "optional": {"vercel-react-best-practices"},
    },
    "ai-app": {
        "agents": ["planner", "fullstack-dev", "qa-tester", "code-reviewer"],
        "optionalAgents": ["ui-designer"],
        "required": {
            "spec-kit",
            "test-driven-development",
            "code-review-and-quality",
        },
        "optional": {
            "api-and-interface-design",
            "design-taste-frontend",
            "playwright-cli",
            "vercel-react-best-practices",
        },
    },
}
RULE_SNIPPETS = [
    "Owner: Spec Kit",
    "speckit-implement",
    "Do not use other planning or implementation workflows.",
    "Owner: design-taste-frontend",
    "Owner: api-and-interface-design",
    "Owner: vercel-react-best-practices",
    "test-driven-development",
    "playwright-cli",
    "Owner: code-review-and-quality",
    ".cursor/project-profile.json",
    "profiles/<profile>.json",
]
SPEC_INIT_COMMAND = (
    "specify init --here --non-interactive --integration cursor-agent "
    "--script sh --ignore-agent-tools"
)
MACHINE_PATH = re.compile(r"(^|[\s\"'=])/(home|Users)/")
REQUIRED_TOOLS = ["bash", "git", "python3", "node", "npm", "specify"]


def emit(line):
    print(line)


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("%s: %s" % (path, exc))


def parse_frontmatter(text):
    if not text.startswith("---\n"):
        raise ValueError("missing opening frontmatter")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise ValueError("missing closing frontmatter")
    data = {}
    for index, line in enumerate(text[4:end].splitlines(), start=2):
        if not line.strip():
            continue
        if ":" not in line:
            raise ValueError("frontmatter line %s has no key" % index)
        key, raw = line.split(":", 1)
        key = key.strip()
        value = raw.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if value == "true":
            parsed = True
        elif value == "false":
            parsed = False
        else:
            parsed = value
        if key in data:
            raise ValueError("duplicate frontmatter key %s" % key)
        data[key] = parsed
    return data, text[end + 5 :]


def validate_profile_data(data, expected_id):
    errors = []
    if not isinstance(data, dict):
        return ["profile root must be an object"]
    unknown = set(data) - PROFILE_KEYS
    if unknown:
        errors.append("unknown profile fields: %s" % ", ".join(sorted(unknown)))
    if data.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    if data.get("id") != expected_id:
        errors.append("id must match filename")
    if not isinstance(data.get("title"), str) or not data.get("title").strip():
        errors.append("title is required")
    if data.get("hidesGlobalSkills") is not False:
        errors.append("hidesGlobalSkills must be false")
    contract = PROFILE_CONTRACT.get(expected_id)
    if contract is None:
        errors.append("unsupported profile id")
        return errors
    if data.get("agents") != contract["agents"]:
        errors.append("agents do not match the profile contract")
    if data.get("optionalAgents") != contract["optionalAgents"]:
        errors.append("optionalAgents do not match the profile contract")
    skills = data.get("skills")
    if not isinstance(skills, list):
        errors.append("skills must be a list")
        return errors
    seen = set()
    required = set()
    optional = set()
    for skill in skills:
        if not isinstance(skill, dict):
            errors.append("skill entry must be an object")
            continue
        extra = set(skill) - SKILL_KEYS
        if extra:
            errors.append("unknown skill fields: %s" % ", ".join(sorted(extra)))
        skill_id = skill.get("id")
        if not isinstance(skill_id, str) or skill_id in seen:
            errors.append("invalid or duplicate skill id")
            continue
        seen.add(skill_id)
        if not isinstance(skill.get("required"), bool):
            errors.append("%s required must be boolean" % skill_id)
        when = skill.get("when")
        if when is not None and when not in WHEN_VALUES:
            errors.append("%s has unsupported when value" % skill_id)
        paths = skill.get("paths")
        if not isinstance(paths, list) or not paths:
            errors.append("%s needs at least one path" % skill_id)
        else:
            for item in paths:
                if not isinstance(item, str) or item.startswith("/") or item.startswith("~"):
                    errors.append("%s path is not portable: %s" % (skill_id, item))
        if skill_id == "playwright-cli" and skill.get("browserRequired") is not False:
            errors.append("playwright-cli browserRequired must be false")
        if skill.get("required") is True:
            required.add(skill_id)
        else:
            optional.add(skill_id)
    if required != contract["required"]:
        errors.append("required skills do not match the profile contract")
    if optional != contract["optional"]:
        errors.append("optional skills do not match the profile contract")
    return errors


def skill_required(skill, react_enabled):
    if skill.get("required") is True:
        return True
    return skill.get("when") == "react" and react_enabled


def check_skill_files(root, profile, react_enabled):
    errors = []
    notes = []
    for skill in profile["skills"]:
        required = skill_required(skill, react_enabled)
        missing = []
        for rel in skill["paths"]:
            if not (root / rel).is_file():
                missing.append(rel)
        if missing and required:
            errors.append(
                "missing required skill %s: %s" % (skill["id"], ", ".join(missing))
            )
        elif missing:
            notes.append("optional-absent %s" % skill["id"])
        elif required:
            notes.append("required-present %s" % skill["id"])
        else:
            notes.append("optional-present %s" % skill["id"])
    return errors, notes


def check_speckit(root):
    errors = []
    integration_path = root / ".specify" / "integration.json"
    options_path = root / ".specify" / "init-options.json"
    manifest_path = root / ".specify" / "integrations" / "cursor-agent.manifest.json"
    if not integration_path.is_file() or not options_path.is_file() or not manifest_path.is_file():
        errors.append("Spec Kit integration is absent. Bootstrap does not create Spec Kit files.")
        errors.append(SPEC_INIT_COMMAND)
        return errors
    try:
        integration = load_json(integration_path)
        options = load_json(options_path)
        manifest = load_json(manifest_path)
    except ValueError as exc:
        return [str(exc)]
    if integration.get("integration") != "cursor-agent":
        errors.append("integration.json is not cursor-agent")
    if "cursor-agent" not in integration.get("installed_integrations", []):
        errors.append("cursor-agent is not installed in integration.json")
    settings = integration.get("integration_settings", {}).get("cursor-agent", {})
    if settings.get("script") != "sh":
        errors.append("cursor-agent script is not sh")
    version = integration.get("version")
    if options.get("speckit_version") != version or options.get("integration") != "cursor-agent":
        errors.append("init-options.json does not match integration.json")
    if manifest.get("version") != version or manifest.get("integration") != "cursor-agent":
        errors.append("cursor-agent manifest does not match integration.json")
    files = manifest.get("files")
    if not isinstance(files, dict) or not files:
        errors.append("cursor-agent manifest has no files")
        return errors
    for rel, digest in sorted(files.items()):
        path = root / rel
        if not path.is_file():
            errors.append("manifest file missing: %s" % rel)
            continue
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != digest:
            errors.append("manifest hash mismatch: %s" % rel)
    return errors


def check_agents(root):
    errors = []
    agent_dir = root / ".cursor" / "agents"
    for name in EXPECTED_AGENTS:
        path = agent_dir / ("%s.md" % name)
        if not path.is_file():
            errors.append("missing agent %s" % path)
            continue
        try:
            data, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        except ValueError as exc:
            errors.append("%s: %s" % (name, exc))
            continue
        unknown = set(data) - AGENT_KEYS
        if unknown:
            errors.append("%s has unsupported frontmatter: %s" % (name, ", ".join(sorted(unknown))))
        if data.get("name") != name:
            errors.append("%s name does not match filename" % name)
        if not isinstance(data.get("description"), str) or not data.get("description").strip():
            errors.append("%s description is empty" % name)
        if data.get("model") != "inherit":
            errors.append("%s model must be inherit" % name)
        if name == "code-reviewer":
            if data.get("readonly") is not True:
                errors.append("code-reviewer must set readonly: true")
        elif data.get("readonly") is True:
            errors.append("%s must not be readonly" % name)
        if ".cursor/project-profile.json" not in body:
            errors.append("%s does not read the selected profile" % name)
        if not body.strip():
            errors.append("%s body is empty" % name)
    return errors


def check_rule(root):
    errors = []
    path = root / ".cursor" / "rules" / "skill-routing.mdc"
    if not path.is_file():
        return ["missing skill-routing.mdc"]
    text = path.read_text(encoding="utf-8")
    if "Wedding Music Planner" in text:
        errors.append("skill-routing.mdc still has a product-specific heading")
    for snippet in RULE_SNIPPETS:
        if snippet not in text:
            errors.append("skill-routing.mdc missing: %s" % snippet)
    return errors


def check_portable(root):
    errors = []
    roots = [
        root / "scripts",
        root / "profiles",
        root / ".cursor" / "agents",
        root / ".cursor" / "rules" / "skill-routing.mdc",
        root / ".cursor" / "project-profile.json",
        root / "README.md",
        root / "docs",
    ]
    for item in roots:
        paths = [item] if item.is_file() else list(item.rglob("*")) if item.exists() else []
        if not item.exists():
            continue
        for path in paths:
            if not path.is_file():
                continue
            if path.suffix == ".pyc" or "__pycache__" in path.parts:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeError:
                errors.append("file is not UTF-8 text: %s" % path.relative_to(root))
                continue
            for number, line in enumerate(text.splitlines(), start=1):
                if MACHINE_PATH.search(line):
                    errors.append(
                        "machine-specific path in %s:%s" % (path.relative_to(root), number)
                    )
    return errors


def check_gitignore(root):
    errors = []
    path = root / ".gitignore"
    if not path.is_file():
        return ["missing .gitignore"]
    kept = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        kept.append(stripped)
    blocked = {
        ".cursor",
        ".cursor/",
        "/.cursor",
        "/.cursor/",
        ".agents",
        ".agents/",
        "profiles",
        "profiles/",
        "scripts",
        "scripts/",
        ".specify",
        ".specify/",
    }
    for line in kept:
        if line in blocked:
            errors.append(".gitignore excludes reusable path: %s" % line)
    for required in (".playwright/", "*.deb"):
        if required not in kept:
            errors.append(".gitignore missing %s" % required)
    return errors


def browser_status():
    info = {}
    os_release = Path("/etc/os-release")
    if os_release.is_file():
        for line in os_release.read_text(encoding="utf-8").splitlines():
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            info[key] = value.strip().strip('"')
    machine = os.uname().machine
    if info.get("ID") == "ubuntu" and info.get("VERSION_ID") == "20.04" and machine in ("x86_64", "amd64"):
        return "unavailable", "Playwright does not support chromium on ubuntu20.04-x64"
    return "not-tested", "Browser runtime was not launched"


def tool_report():
    lines = []
    errors = []
    for name in REQUIRED_TOOLS:
        path = shutil.which(name)
        if path is None:
            errors.append(name)
            lines.append("tool %s=missing" % name)
            continue
        try:
            completed = subprocess.run(
                [path, "--version"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                timeout=10,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            errors.append(name)
            lines.append("tool %s=error %s" % (name, exc))
            continue
        version = completed.stdout.strip().splitlines()
        shown = version[0] if version else "no-output"
        if completed.returncode != 0:
            errors.append(name)
            lines.append("tool %s=failed %s" % (name, shown))
        else:
            lines.append("tool %s=%s" % (name, shown))
    playwright = shutil.which("playwright-cli")
    lines.append("tool playwright-cli=%s" % ("present" if playwright else "absent"))
    return lines, errors


def selected_profile(root):
    path = root / ".cursor" / "project-profile.json"
    if not path.is_file():
        raise ValueError("missing .cursor/project-profile.json")
    data = load_json(path)
    if not isinstance(data, dict):
        raise ValueError("project profile must be an object")
    profile_id = data.get("profile")
    if profile_id not in EXPECTED_PROFILES:
        raise ValueError("selected profile is not supported")
    if data.get("schemaVersion") != 1:
        raise ValueError("selected profile schemaVersion must be 1")
    if data.get("profileSource") != "profiles/%s.json" % profile_id:
        raise ValueError("profileSource does not match the selected profile")
    if not isinstance(data.get("react"), bool):
        raise ValueError("react must be boolean")
    return data


def dump_profile(data):
    return json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def command_verify(root):
    errors = []
    for rel in EXPECTED_SCRIPTS + REQUIRED_DOCS:
        path = root / rel
        if not path.is_file():
            errors.append("missing %s" % rel)
            continue
        if rel.startswith("scripts/") and rel.endswith(".sh") and not os.access(str(path), os.X_OK):
            errors.append("script is not executable: %s" % rel)
    for profile_id in EXPECTED_PROFILES:
        path = root / "profiles" / ("%s.json" % profile_id)
        if not path.is_file():
            errors.append("missing profile %s" % profile_id)
            continue
        try:
            data = load_json(path)
        except ValueError as exc:
            errors.append(str(exc))
            continue
        errors.extend(validate_profile_data(data, profile_id))
    errors.extend(check_agents(root))
    errors.extend(check_rule(root))
    errors.extend(check_speckit(root))
    errors.extend(check_portable(root))
    errors.extend(check_gitignore(root))
    notes = []
    try:
        selected = selected_profile(root)
    except ValueError as exc:
        errors.append(str(exc))
        selected = None
    if selected is not None:
        profile_path = root / selected["profileSource"]
        try:
            profile = load_json(profile_path)
            errors.extend(validate_profile_data(profile, selected["profile"]))
            skill_errors, notes = check_skill_files(root, profile, selected["react"])
            errors.extend(skill_errors)
        except ValueError as exc:
            errors.append(str(exc))
    for note in notes:
        emit("skill %s" % note)
    if errors:
        emit("STRUCTURE=fail")
        for item in errors:
            emit("structure-error %s" % item)
    else:
        emit("STRUCTURE=pass")
    tool_lines, tool_errors = tool_report()
    for line in tool_lines:
        emit(line)
    if tool_errors:
        emit("TOOLS=fail")
        emit("tool-error missing %s" % ", ".join(tool_errors))
    else:
        emit("TOOLS=pass")
    emit("CURSOR_INVOCATION=not-proven")
    emit("cursor-note File existence does not prove Cursor invoked a skill or subagent.")
    status, detail = browser_status()
    emit("BROWSER_RUNTIME=%s" % status)
    emit("BROWSER_CHECK=not-pass")
    emit("browser-note %s" % detail)
    if errors:
        emit("RESULT=structure-fail")
        return 3
    if tool_errors:
        emit("RESULT=tools-missing")
        return 1
    emit("RESULT=pass")
    return 0


def command_write_profile(root, profile_id, react_enabled, dry_run):
    if profile_id not in EXPECTED_PROFILES:
        emit("invalid profile: %s" % profile_id)
        return 2
    path = root / "profiles" / ("%s.json" % profile_id)
    if not path.is_file():
        emit("invalid profile: %s" % profile_id)
        return 2
    try:
        profile = load_json(path)
    except ValueError as exc:
        emit(str(exc))
        return 3
    errors = validate_profile_data(profile, profile_id)
    if errors:
        for item in errors:
            emit("profile-error %s" % item)
        return 3
    spec_errors = check_speckit(root)
    if spec_errors:
        for item in spec_errors:
            emit("speckit-error %s" % item)
        emit("no files written")
        return 3
    skill_errors, notes = check_skill_files(root, profile, react_enabled)
    for note in notes:
        emit("skill %s" % note)
    if skill_errors:
        for item in skill_errors:
            emit("skill-error %s" % item)
        emit("no files written")
        return 3
    selection_path = root / ".cursor" / "project-profile.json"
    current = {}
    if selection_path.is_file():
        try:
            loaded = load_json(selection_path)
        except ValueError as exc:
            emit(str(exc))
            return 3
        if not isinstance(loaded, dict):
            emit("project profile must be an object")
            return 3
        current = loaded
    current["schemaVersion"] = 1
    current["profile"] = profile_id
    current["profileSource"] = "profiles/%s.json" % profile_id
    current["react"] = react_enabled
    rendered = dump_profile(current)
    emit("profile=%s" % profile_id)
    emit("react=%s" % ("true" if react_enabled else "false"))
    if dry_run:
        emit("DRY-RUN")
        if selection_path.is_file() and selection_path.read_text(encoding="utf-8") == rendered:
            emit("action=unchanged")
        else:
            emit("action=would-write")
            emit("target=.cursor/project-profile.json")
        emit("no files written")
        return 0
    selection_path.parent.mkdir(parents=True, exist_ok=True)
    if selection_path.is_file() and selection_path.read_text(encoding="utf-8") == rendered:
        emit("UNCHANGED .cursor/project-profile.json")
        return 0
    temporary = selection_path.with_name(".project-profile.json.tmp")
    temporary.write_text(rendered, encoding="utf-8")
    os.replace(str(temporary), str(selection_path))
    emit("WROTE .cursor/project-profile.json")
    return 0


def command_browser():
    status, detail = browser_status()
    emit("BROWSER_RUNTIME=%s" % status)
    emit("BROWSER_CHECK=not-pass")
    emit("browser-note %s" % detail)
    return 0


def main(argv):
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("command")
    parser.add_argument("--root", default=".")
    parser.add_argument("--profile")
    parser.add_argument("--react", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    if args.command == "verify":
        return command_verify(root)
    if args.command == "write-profile":
        if not args.profile:
            emit("missing --profile")
            return 2
        return command_write_profile(root, args.profile, args.react, args.dry_run)
    if args.command == "browser":
        return command_browser()
    emit("unknown command")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
