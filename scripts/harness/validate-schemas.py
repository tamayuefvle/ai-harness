#!/usr/bin/env python3
import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator, FormatChecker
except Exception as exc:
    print(f"[FAIL] Python jsonschema is unavailable: {exc}", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "harness/schemas/validation-manifest.json"


def load(relative):
    path = ROOT / relative
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"{relative}: invalid JSON: {exc}") from exc


def main():
    manifest = load("harness/schemas/validation-manifest.json")
    failures = []
    for case in manifest.get("cases", []):
        schema = load(case["schema"])
        instance = load(case["instance"])
        try:
            Draft202012Validator.check_schema(schema)
            validator = Draft202012Validator(schema, format_checker=FormatChecker())
            errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.absolute_path))
            if errors:
                for error in errors:
                    location = "/" + "/".join(str(p) for p in error.absolute_path)
                    failures.append(f"{case['id']} {location}: {error.message}")
            else:
                print(f"[PASS] {case['id']} ({case['schema']} <- {case['instance']})")
        except Exception as exc:
            failures.append(f"{case['id']}: {exc}")
    if failures:
        for failure in failures:
            print(f"[FAIL] {failure}", file=sys.stderr)
        return 1
    print(f"[PASS] {len(manifest.get('cases', []))} Draft 2020-12 schema cases validated with python-jsonschema")
    return 0


if __name__ == "__main__":
    sys.exit(main())
