#!/usr/bin/env python3
"""security-baseline: merge actionlint and zizmor results, apply the allow-file.

Pure standard library, Python 3.9 compatible. The tools themselves are run by
run.sh; this script only reads their JSON output, so it can be unit tested
with recorded outputs (test_check.py).

Blocking rules:
  * every actionlint error                              (rule "actionlint")
  * zizmor "unpinned-uses", "secrets-inherit", "dangerous-triggers"
  * every zizmor finding with severity High
  * "missing-top-level-permissions" (own check: no top-level `permissions:` and
    not every job has its own `permissions:`)
Every other zizmor finding is a warning. A finding that is a known gap of the pinned tool
(KNOWN_TOOL_GAPS, e.g. actionlint 1.7.12 and `concurrency.queue`) has the status "tool-gap":
not blocking, no allow entry needed, a notice annotation.

Allow-file shape (nothing else is accepted):

  allow:
    - rule: dangerous-triggers
      file: .github/workflows/release-production.yml
      reason: "Why this existing use is safe"
      match: "optional substring of the finding message"

An entry suppresses that rule in that file. The optional key `match` is a
case-sensitive substring that the finding message must contain, so an entry
covers one finding and a new finding of the same rule in the same file still
blocks. zizmor's text is the same for every unpinned-uses, secrets-inherit and
template-injection finding, so their message ends with the distinguishing parts
`[uses: <ref>]` (unpinned-uses, secrets-inherit), `[expr: <expression>]`
(template-injection) and `[job: <id>]` (all three, in a workflow). An entry without `match` covers the whole file and produces a warning.
An entry without a non-empty reason is an error. An entry that matched no
blocking finding is stale and only produces a warning. File paths are compared from their `.github/` segment
on (see match_path), so a prefixed scan path still matches.
"""

import argparse
import json
import os
import posixpath
import re
import sys

RULE_ACTIONLINT = "actionlint"
RULE_PERMISSIONS = "missing-top-level-permissions"
BLOCKING_ZIZMOR_RULES = ("unpinned-uses", "secrets-inherit", "dangerous-triggers")
ALLOW_KEYS = ("rule", "file", "reason")
ALLOW_OPTIONAL_KEYS = ("match",)

STATUS_BLOCKING = "blocking"
STATUS_ALLOWED = "allowed"
STATUS_WARNING = "warning"
STATUS_TOOL_GAP = "tool-gap"

# Known gaps of the pinned tools: a message the tool prints for something GitHub accepts.
# A finding whose rule and whole message match is not blocking and needs no allow entry; it
# stays in the report with status "tool-gap" and prints a ::notice::. Only an exact message
# is covered, so every other error of the same rule still blocks. Remove an item when the
# pinned tool version knows the feature.
KNOWN_TOOL_GAPS = (
    {
        "id": "concurrency-queue",
        "rule": RULE_ACTIONLINT,
        "message": re.compile(
            r'unexpected key "queue" for "concurrency" section\. expected one of "cancel-in-progress", "group"'),
        # the workflow line of the finding must be exactly `queue: max` (the only value GitHub accepts today)
        # (YAML: a comment needs whitespace before `#`; `max#x` is the value "max#x")
        "line": re.compile(r"""\s*queue\s*:\s*(?:max|"max"|'max')(?:\s+#.*)?\s*"""),
        "reason": "actionlint 1.7.12 does not know `concurrency.queue` (GitHub accepts `queue: max`)",
        "url": "https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues",
    },
)

# zizmor rules whose Primary location is the `uses:` reference itself (the action of unpinned-uses,
# the called workflow of secrets-inherit): the reference is added to the message as `[uses: <ref>]`,
# so an allow entry's `match` can single out one reference.
USES_REFERENCE_RULES = ("unpinned-uses", "secrets-inherit")
# zizmor rules whose Primary location is the expression inside a `run:` or script: the expression is
# added as `[expr: <expression>]`.
EXPRESSION_RULES = ("template-injection",)
# Rules whose message gets the job id of the Primary location as `[job: <id>]` (workflow files only;
# a composite action has no job). zizmor's own text of these rules is the same for every finding.
JOB_RULES = USES_REFERENCE_RULES + EXPRESSION_RULES


# --------------------------------------------------------------------------
# allow-file parser
# --------------------------------------------------------------------------

def _parse_value(raw):
    """Return the scalar text of a YAML value (quoted or bare), or raise ValueError."""
    raw = raw.strip()
    if not raw:
        return ""
    quote = raw[0]
    if quote in ('"', "'"):
        i = 1
        while i < len(raw):
            c = raw[i]
            if quote == '"' and c == "\\":
                i += 2
                continue
            if c == quote:
                if quote == "'" and raw[i + 1:i + 2] == "'":
                    i += 2
                    continue
                break
            i += 1
        else:
            raise ValueError("unterminated quoted string")
        rest = raw[i + 1:].strip()
        if rest and not rest.startswith("#"):
            raise ValueError("unexpected text after quoted string")
        inner = raw[:i + 1]
        if quote == '"':
            try:
                return json.loads(inner)
            except ValueError:
                return inner[1:-1]
        return inner[1:-1].replace("''", "'")
    # bare scalar: a comment starts at " #"
    for idx, c in enumerate(raw):
        if c == "#" and (idx == 0 or raw[idx - 1] in " \t"):
            raw = raw[:idx]
            break
    return raw.strip()


def parse_allow(text):
    """Parse the allow-file. Returns (entries, errors).

    entries: list of {"rule", "file", "reason", "match", "line"} ("match" is None
    when the entry covers the whole file); errors: list of
    (line, message). An entry without a rule, file or non-empty reason is an
    error; when there is any error, no entry is returned.
    """
    entries = []
    errors = []
    current = None  # {"line": n, "fields": {...}}
    seen_allow = False

    def close_entry():
        nonlocal current
        if current is None:
            return
        fields = current["fields"]
        line = current["line"]
        label = "allow entry at line %d" % line
        ok = True
        for key in ALLOW_KEYS:
            if not fields.get(key, "").strip():
                errors.append((line, "%s: missing or empty %r%s" % (
                    label, key, " (every exception needs a reason)" if key == "reason" else "")))
                ok = False
        if "match" in fields and not fields["match"]:
            errors.append((line, "%s: 'match' must not be empty (leave it out to cover the whole file)" % label))
            ok = False
        if ok:
            entries.append({
                "rule": fields["rule"].strip(),
                "file": normalize_path(fields["file"].strip()),
                "reason": fields["reason"].strip(),
                "match": fields.get("match"),
                "line": line,
            })
        current = None

    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if "\t" in line[:indent + 1]:
            errors.append((number, "tabs are not allowed for indentation"))
            continue
        if indent == 0:
            if not stripped.startswith("allow:"):
                errors.append((number, "unsupported line (expected a top-level 'allow:')"))
                continue
            close_entry()
            seen_allow = True
            try:
                rest = _parse_value(stripped[len("allow:"):])
            except ValueError as exc:
                errors.append((number, str(exc)))
                continue
            if rest not in ("", "[]"):
                errors.append((number, "'allow:' must be followed by a list (or be '[]')"))
            continue
        if not seen_allow:
            errors.append((number, "content before the top-level 'allow:'"))
            continue
        body = stripped
        starts_entry = False
        if body.startswith("- ") or body == "-":
            starts_entry = True
            body = body[1:].strip()
        if ":" not in body:
            errors.append((number, "unsupported line (expected 'key: value')"))
            continue
        key, _, value = body.partition(":")
        key = key.strip()
        if key not in ALLOW_KEYS + ALLOW_OPTIONAL_KEYS:
            errors.append((number, "unknown key %r (allowed: rule, file, reason, match)" % key))
            continue
        try:
            parsed = _parse_value(value)
        except ValueError as exc:
            errors.append((number, "%s (key %r)" % (exc, key)))
            continue
        if starts_entry:
            close_entry()
            current = {"line": number, "fields": {}}
        elif current is None:
            errors.append((number, "key %r outside of a list item" % key))
            continue
        if key in current["fields"]:
            errors.append((number, "duplicate key %r in one entry" % key))
            continue
        current["fields"][key] = parsed
    close_entry()
    if errors:
        entries = []  # an invalid allow-file applies nothing
    return entries, errors


# --------------------------------------------------------------------------
# path helpers
# --------------------------------------------------------------------------

def normalize_path(path, root=None):
    path = path.replace("\\", "/")
    if ".." in path.split("/"):
        # zizmor prints the path it was given (`.github/workflows/../actions/x/action.yml`)
        path = posixpath.normpath(path)
    if root:
        prefix = root.replace("\\", "/").rstrip("/") + "/"
        if path.startswith(prefix):
            path = path[len(prefix):]
    while path.startswith("./"):
        path = path[2:]
    return path


def match_path(path):
    """Path used to match a finding against an allow entry.

    Both sides are compared from their `.github/` segment on: the last
    occurrence of `/.github/`, else a leading `.github/`. A path without one
    compares as it is (after normalize_path). This lets a run with
    `path: fixtures/x/.github/workflows` match an entry `.github/workflows/a.yml`.
    """
    path = normalize_path(path)
    index = path.rfind("/.github/")
    if index >= 0:
        return path[index + 1:]
    return path


def list_workflow_files(root, path):
    """Workflow files (*.yml, *.yaml) under path, relative to root, sorted."""
    full = os.path.join(root, path)
    found = []
    if os.path.isfile(full):
        found.append(normalize_path(path))
    else:
        for base, _dirs, names in os.walk(full):
            for name in names:
                if name.endswith((".yml", ".yaml")):
                    rel = os.path.relpath(os.path.join(base, name), root)
                    found.append(normalize_path(rel))
    return sorted(found)


# --------------------------------------------------------------------------
# tool output readers
# --------------------------------------------------------------------------

def make_finding(rule, source, file, line, column, severity, message):
    return {
        "rule": rule,
        "source": source,
        "file": file,
        "line": line,
        "column": column,
        "severity": severity,
        "message": message,
    }


def read_actionlint(text, root=None):
    """actionlint -format '{{json .}}' prints a JSON array (or null) of errors."""
    data = json.loads(text) if text.strip() else None
    findings = []
    for item in data or []:
        findings.append(make_finding(
            RULE_ACTIONLINT, "actionlint",
            normalize_path(item.get("filepath", ""), root),
            int(item.get("line") or 1), int(item.get("column") or 1),
            "Error", item.get("message", "").strip()))
    return findings


def _primary(finding):
    for loc in finding.get("locations") or []:
        if (loc.get("symbolic") or {}).get("kind") == "Primary":
            return loc
    return {}


def _plain(text):
    text = (text or "").strip() if isinstance(text, str) else ""
    return text if text and "\n" not in text and len(text) <= 200 else ""


def _zizmor_reference(finding):
    """The `uses:` reference of the Primary location (concrete.feature), or "" when not a plain one."""
    return _plain((_primary(finding).get("concrete") or {}).get("feature"))


def _zizmor_expression(finding):
    """The expression of the Primary subfeature (`steps.x.outputs.y`), or "" when there is none."""
    kind = (_primary(finding).get("symbolic") or {}).get("feature_kind")
    if not isinstance(kind, dict):
        return ""
    fragment = (kind.get("Subfeature") or {}).get("fragment") or {}
    return _plain(fragment.get("Raw")) if isinstance(fragment, dict) else ""


def _zizmor_job(finding):
    """The job id of the Primary route (`jobs.<id>...`), or "" outside a job."""
    route = (((_primary(finding).get("symbolic") or {}).get("route") or {}).get("route")) or []
    if len(route) >= 2 and route[0] == {"Key": "jobs"} and isinstance(route[1], dict):
        return _plain(route[1].get("Key"))
    return ""


def _zizmor_location(finding):
    locations = finding.get("locations") or []
    chosen = None
    for loc in locations:
        if (loc.get("symbolic") or {}).get("kind") == "Primary":
            chosen = loc
            break
    if chosen is None and locations:
        chosen = locations[0]
    if chosen is None:
        return "", 1, 1, ""
    symbolic = chosen.get("symbolic") or {}
    key = symbolic.get("key") or {}
    if isinstance(key, dict) and "Local" in key:
        file = key["Local"].get("verbatim_path", "")
    else:
        file = json.dumps(key, sort_keys=True)
    point = ((chosen.get("concrete") or {}).get("location") or {}).get("start_point") or {}
    # zizmor rows and columns are 0-based
    return file, int(point.get("row", 0)) + 1, int(point.get("column", 0)) + 1, symbolic.get("annotation", "")


def read_zizmor(text, root=None):
    """zizmor --format json prints a JSON array of findings."""
    data = json.loads(text) if text.strip() else []
    findings = []
    for item in data:
        file, line, column, annotation = _zizmor_location(item)
        desc = (item.get("desc") or "").strip()
        message = desc if not annotation else "%s: %s" % (desc, annotation)
        ident = item.get("ident")
        if ident in USES_REFERENCE_RULES:
            reference = _zizmor_reference(item)
            if reference:
                message += " [uses: %s]" % reference
        if ident in EXPRESSION_RULES:
            expression = _zizmor_expression(item)
            if expression:
                message += " [expr: %s]" % expression
        if ident in JOB_RULES:
            job = _zizmor_job(item)
            if job:
                message += " [job: %s]" % job
        findings.append(make_finding(
            item.get("ident", "zizmor"), "zizmor",
            normalize_path(file, root), line, column,
            (item.get("determinations") or {}).get("severity", "Unknown"),
            message))
    return findings


_KEY_RE = re.compile(r"""^(?:"([^"]*)"|'([^']*)'|([^\s#'"\-][^#]*?))\s*:(?:\s+(.*))?$""")


def _yaml_key(content):
    """(key, rest) of a `key: rest` line (indentation removed), else (None, None)."""
    match = _KEY_RE.match(content.rstrip())
    if not match:
        return None, None
    key = next(g for g in match.groups()[:3] if g is not None)
    rest = (match.group(4) or "").strip()
    if rest.startswith("#"):
        rest = ""
    return key, rest


def _content_lines(text):
    """(indent, content) of every line that is not blank, a comment or a document marker."""
    out = []
    for raw in text.splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        out.append((len(raw) - len(raw.lstrip(" ")), stripped))
    return out


def has_top_level_permissions(text):
    return any(line.startswith("permissions:") for line in text.splitlines())


def every_job_has_permissions(text):
    """True when `jobs:` is a block mapping and every job has `permissions:` at its own level.

    Indentation-based, no YAML library. Conservative: anything it cannot read
    with certainty (flow-style jobs or `jobs`, an empty `jobs`, odd indentation)
    counts as "not every job has permissions". A `permissions:` deeper in a
    job (a step, `with:`, a block scalar) is not at the job's own level and does
    not count. Reusable-workflow caller jobs (`uses:`) are jobs like any other.
    """
    lines = _content_lines(text)
    start = None
    for index, (indent, content) in enumerate(lines):
        if indent == 0 and content.startswith(("---", "...")):
            continue
        if indent == 0 and _yaml_key(content) == ("jobs", ""):
            start = index + 1
            break
    if start is None:
        return False
    block = []
    for indent, content in lines[start:]:
        if indent == 0:
            break
        block.append((indent, content))
    if not block:
        return False
    job_indent = block[0][0]
    jobs = []  # {"body_indent": int | None, "has": bool}
    for indent, content in block:
        if indent < job_indent:
            return False
        if indent == job_indent:
            key, rest = _yaml_key(content)
            if key is None or rest:
                return False  # not `id:` with a block body (flow style, scalar, sequence)
            jobs.append({"body_indent": None, "has": False})
            continue
        job = jobs[-1]
        if job["body_indent"] is None:
            job["body_indent"] = indent
        if indent == job["body_indent"]:
            key, _rest = _yaml_key(content)
            if key == "permissions":
                job["has"] = True
    return bool(jobs) and all(job["has"] for job in jobs)


def check_top_level_permissions(root, files):
    findings = []
    for rel in files:
        with open(os.path.join(root, rel), encoding="utf-8", errors="replace") as handle:
            text = handle.read()
        if not has_top_level_permissions(text) and not every_job_has_permissions(text):
            findings.append(make_finding(
                RULE_PERMISSIONS, "check.py", rel, 1, 1, "High",
                "workflow has no top-level 'permissions:' block and not every job has one "
                "(the default token is too broad)"))
    return findings


# --------------------------------------------------------------------------
# merge and classify
# --------------------------------------------------------------------------

def is_blocking(finding):
    rule = finding["rule"]
    if rule in (RULE_ACTIONLINT, RULE_PERMISSIONS):
        return True
    if finding["source"] == "zizmor":
        return rule in BLOCKING_ZIZMOR_RULES or finding["severity"] == "High"
    return False


def _source_line(root, finding):
    """The workflow line of the finding (file:line under root), or None when it cannot be read."""
    if root is None:
        return None
    try:
        with open(os.path.join(root, finding["file"]), encoding="utf-8", errors="replace") as handle:
            lines = handle.read().splitlines()
        return lines[finding["line"] - 1] if finding["line"] >= 1 else None
    except (OSError, IndexError):
        return None


def known_tool_gap(finding, root=None):
    """The KNOWN_TOOL_GAPS item that covers this finding, else None.

    Rule and whole message must match and, for an item with a "line" pattern, the workflow
    line at file:line under root must match it (fail closed: an unreadable file or line is
    no gap). So `queue: <invalid value>` stays blocking although actionlint prints the same message.
    """
    for gap in KNOWN_TOOL_GAPS:
        if finding["rule"] != gap["rule"] or not gap["message"].fullmatch(finding["message"]):
            continue
        if "line" in gap:
            text = _source_line(root, finding)
            if text is None or not gap["line"].fullmatch(text):
                continue
        return gap
    return None


def merge(findings, allow_entries, root=None):
    """Deduplicate, classify and apply the allow entries.

    Returns (classified findings, stale entries). Each finding gets a "status". root is the
    repository root: a known tool gap that depends on the workflow line reads it from there.
    """
    seen = set()
    unique = []
    for f in findings:
        key = (f["rule"], f["file"], f["line"], f["message"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(f)
    unique.sort(key=lambda f: (f["file"], f["line"], f["column"], f["rule"], f["message"]))

    matched = set()
    out = []
    for f in unique:
        f = dict(f)
        gap = known_tool_gap(f, root) if is_blocking(f) else None
        if gap is not None:
            f["status"] = STATUS_TOOL_GAP
            f["tool_gap"] = gap["id"]
            f["tool_gap_reason"] = gap["reason"]
            f["tool_gap_url"] = gap["url"]
        elif not is_blocking(f):
            f["status"] = STATUS_WARNING
        else:
            f["status"] = STATUS_BLOCKING
            for index, entry in enumerate(allow_entries):
                if (entry["rule"] == f["rule"] and match_path(entry["file"]) == match_path(f["file"])
                        and (entry.get("match") is None or entry["match"] in f["message"])):
                    f["status"] = STATUS_ALLOWED
                    f["allow_reason"] = entry["reason"]
                    matched.add(index)
        out.append(f)
    stale = [e for i, e in enumerate(allow_entries) if i not in matched]
    return out, stale


# --------------------------------------------------------------------------
# output
# --------------------------------------------------------------------------

def _match_note(entry):
    return "" if entry.get("match") is None else " (match %r)" % entry["match"]


def _esc_data(value):
    return value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def _esc_prop(value):
    return _esc_data(value).replace(":", "%3A").replace(",", "%2C")


def annotation(level, message, file=None, line=None):
    props = ""
    if file:
        props = " file=%s" % _esc_prop(file)
        if line:
            props += ",line=%d" % line
    return "::%s%s::%s" % (level, props, _esc_data(message))


def _cell(value):
    return str(value).replace("|", "\\|").replace("\n", " ")


def build_summary(findings, stale, errors, result, allow_file):
    blocking = [f for f in findings if f["status"] == STATUS_BLOCKING]
    allowed = [f for f in findings if f["status"] == STATUS_ALLOWED]
    warnings = [f for f in findings if f["status"] == STATUS_WARNING]
    gaps = [f for f in findings if f["status"] == STATUS_TOOL_GAP]
    lines = ["## security-baseline: %s" % result, ""]
    lines.append("%d blocking, %d allowed by `%s`, %d warnings, %d stale allow entries, %d allow-file errors."
                 % (len(blocking), len(allowed), allow_file, len(warnings), len(stale), len(errors)))
    if gaps:
        lines.append("%d known tool gaps (not blocking, no allow entry needed)." % len(gaps))
    lines.append("")
    if findings or stale or errors:
        lines.append("| Status | Rule | Location | Severity | Message |")
        lines.append("|---|---|---|---|---|")
        for f in findings:
            msg = f["message"]
            if f["status"] == STATUS_ALLOWED:
                msg += " (allowed: %s)" % f["allow_reason"]
            elif f["status"] == STATUS_TOOL_GAP:
                msg += " (known tool gap: %s; %s)" % (f["tool_gap_reason"], f["tool_gap_url"])
            lines.append("| %s | `%s` | `%s:%d` | %s | %s |" % (
                f["status"], f["rule"], f["file"], f["line"], f["severity"], _cell(msg)))
        for e in stale:
            lines.append("| stale | `%s` | `%s` | - | allow entry%s matched nothing (line %d of `%s`) |" % (
                e["rule"], e["file"], _cell(_match_note(e)), e["line"], allow_file))
        for line, msg in errors:
            lines.append("| error | `allow-file` | `%s:%d` | - | %s |" % (allow_file, line, _cell(msg)))
    else:
        lines.append("No findings.")
    lines.append("")
    return "\n".join(lines)


def evaluate(root, path, actionlint_text, zizmor_text, allow_text, allow_file):
    """Run the whole merge. Returns a dict with report, annotations and summary."""
    files = list_workflow_files(root, path)
    findings = []
    findings += read_actionlint(actionlint_text, root)
    findings += read_zizmor(zizmor_text, root)
    findings += check_top_level_permissions(root, files)

    entries, errors = ([], [])
    if allow_text is not None:
        entries, errors = parse_allow(allow_text)
    classified, stale = merge(findings, entries, root)

    blocking = sum(1 for f in classified if f["status"] == STATUS_BLOCKING)
    if errors:
        result = "error"
    elif blocking:
        result = "failed"
    else:
        result = "passed"

    notes = []
    for f in classified:
        if f["status"] == STATUS_BLOCKING:
            notes.append(annotation("error", "[%s] %s" % (f["rule"], f["message"]), f["file"], f["line"]))
        elif f["status"] == STATUS_WARNING:
            notes.append(annotation("warning", "[%s] %s" % (f["rule"], f["message"]), f["file"], f["line"]))
        elif f["status"] == STATUS_TOOL_GAP:
            notes.append(annotation(
                "notice", "[%s] %s (known tool gap, not blocking: %s; %s)"
                % (f["rule"], f["message"], f["tool_gap_reason"], f["tool_gap_url"]), f["file"], f["line"]))
    for e in stale:
        notes.append(annotation(
            "warning", "stale allow entry: rule %s in %s%s matched no blocking finding; remove it"
            % (e["rule"], e["file"], _match_note(e)), allow_file, e["line"]))
    whole_file = [e for e in entries if e.get("match") is None and e not in stale]
    for e in whole_file:
        notes.append(annotation(
            "warning", "allow entry covers the whole file: every finding of rule %s in %s is suppressed, "
            "also new ones; add a 'match' with a substring of the finding message to cover one finding"
            % (e["rule"], e["file"]), allow_file, e["line"]))
    for line, msg in errors:
        notes.append(annotation("error", "invalid allow-file: %s" % msg, allow_file, line))

    report = {
        "version": 1,
        "result": result,
        "blocking": blocking,
        "allowed": sum(1 for f in classified if f["status"] == STATUS_ALLOWED),
        "warnings": sum(1 for f in classified if f["status"] == STATUS_WARNING),
        "tool_gaps": sum(1 for f in classified if f["status"] == STATUS_TOOL_GAP),
        "stale": [{"rule": e["rule"], "file": e["file"], "line": e["line"]} for e in stale],
        "whole_file_allow": [{"rule": e["rule"], "file": e["file"], "line": e["line"]} for e in whole_file],
        "allow_file_errors": [{"line": n, "message": m} for n, m in errors],
        "workflows_checked": files,
        "findings": classified,
    }
    return {
        "result": result,
        "blocking": blocking,
        "report": report,
        "annotations": notes,
        "summary": build_summary(classified, stale, errors, result, allow_file),
    }


def _read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--root", default=".", help="repository root (default: .)")
    parser.add_argument("--path", default=".github/workflows", help="workflow directory or file, relative to --root")
    parser.add_argument("--actionlint-json", required=True)
    parser.add_argument("--zizmor-json", required=True)
    parser.add_argument("--allow-file", default=".monitoring/security-baseline-allow.yml")
    parser.add_argument("--report", required=True, help="where to write the JSON report")
    args = parser.parse_args(argv)

    root = os.path.abspath(args.root)
    allow_path = os.path.join(root, args.allow_file)
    allow_text = _read(allow_path) if os.path.isfile(allow_path) else None
    outcome = evaluate(
        root, normalize_path(args.path), _read(args.actionlint_json), _read(args.zizmor_json),
        allow_text, normalize_path(args.allow_file))

    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump(outcome["report"], handle, indent=2, sort_keys=True)
        handle.write("\n")
    for note in outcome["annotations"]:
        print(note)
    summary_file = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_file:
        with open(summary_file, "a", encoding="utf-8") as handle:
            handle.write(outcome["summary"] + "\n")
    else:
        print(outcome["summary"])
    write_outputs(outcome["result"], outcome["blocking"])
    return 0 if outcome["result"] == "passed" else 1


def write_outputs(result, blocking):
    output_file = os.environ.get("GITHUB_OUTPUT")
    if output_file:
        with open(output_file, "a", encoding="utf-8") as handle:
            handle.write("result=%s\nblocking=%d\n" % (result, blocking))


def entry(argv=None):
    """main() with a safety net: an unexpected error still writes result=error and exits 3."""
    try:
        return main(argv)
    except Exception:  # noqa: BLE001 - the step must fail with a usable result
        import traceback
        traceback.print_exc()
        print("::error::security-baseline: check.py failed unexpectedly (see the traceback above).")
        write_outputs("error", 0)
        return 3


if __name__ == "__main__":
    sys.exit(entry())
