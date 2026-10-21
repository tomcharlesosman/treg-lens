#!/usr/bin/env python3
"""Run shared vectors against an explicitly supplied native adapter; no dependencies."""
from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import math
from pathlib import Path
import sys


def reject_constant(value: str):
    raise ValueError(f"Non-JSON numeric constant: {value}")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)


def json_equal(actual, expected) -> bool:
    """Object order is irrelevant; array order/types matter; bool is not a number."""
    if isinstance(actual, bool) or isinstance(expected, bool):
        return type(actual) is type(expected) and actual == expected
    if isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        return math.isfinite(actual) and math.isfinite(expected) and actual == expected
    if type(actual) is not type(expected):
        return False
    if isinstance(actual, dict):
        return actual.keys() == expected.keys() and all(json_equal(actual[key], expected[key]) for key in actual)
    if isinstance(actual, list):
        return len(actual) == len(expected) and all(json_equal(a, b) for a, b in zip(actual, expected))
    return actual == expected


def vectors(root: Path):
    manifest = read_json(root / "manifest.json")
    if manifest.get("contractVersion") != 1:
        raise ValueError("Unsupported portable contract version")
    cases, ids, operations = [], set(), set()
    for filename in manifest["suites"]:
        path = root / filename
        if path.resolve().parent != root.resolve():
            raise ValueError("Suites must be direct JSON files inside the version directory")
        suite = read_json(path)
        if suite.get("contractVersion") != 1:
            raise ValueError(f"Unsupported suite version: {filename}")
        for case in suite["cases"]:
            if set(case) != {"id", "operation", "input", "expected"}:
                raise ValueError(f"Malformed vector in {filename}")
            if not isinstance(case["id"], str) or not case["id"] or case["id"] in ids:
                raise ValueError("Vector IDs must be nonempty and unique")
            if case["operation"] not in manifest["operations"]:
                raise ValueError(f"Unknown operation: {case['operation']}")
            ids.add(case["id"])
            operations.add(case["operation"])
            cases.append(case)
    if operations != set(manifest["operations"]):
        raise ValueError("Every declared operation needs a fixed test vector")
    return cases


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contracts", type=Path, default=Path(__file__).parent / "v1")
    parser.add_argument("--adapter", type=Path, help="Native Python file exporting evaluate(operation, input_data)")
    parser.add_argument("--validate-only", action="store_true", help="Check fixture structure; does not verify domain/native parity")
    args = parser.parse_args(argv)
    try:
        cases = vectors(args.contracts)
        if args.validate_only:
            if args.adapter:
                parser.error("--validate-only and --adapter are mutually exclusive")
            print(json.dumps({"contractVersion": 1, "vectors": len(cases), "fixtureStructure": "valid", "nativeParity": "unverified"}))
            return 0
        if not args.adapter:
            print("Native parity is unverified: supply --adapter PATH to a real native implementation, or --validate-only for fixture structure.", file=sys.stderr)
            return 2
        spec = importlib.util.spec_from_file_location("treg_lens_native_contract_adapter", args.adapter.resolve())
        if spec is None or spec.loader is None:
            raise ValueError("Cannot load the supplied native adapter")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        evaluate = getattr(module, "evaluate", None)
        if not callable(evaluate):
            raise ValueError("The adapter must export evaluate(operation, input_data)")
        failures = []
        for case in cases:
            try:
                # The adapter sees inputs only, never the expected values or vector ID.
                actual = evaluate(case["operation"], copy.deepcopy(case["input"]))
                json.dumps(actual, allow_nan=False)
                if not json_equal(actual, case["expected"]):
                    failures.append({"id": case["id"], "reason": "output mismatch"})
            except Exception as error:
                failures.append({"id": case["id"], "reason": f"{type(error).__name__}: {error}"})
        print(json.dumps({"contractVersion": 1, "vectors": len(cases), "passed": len(cases) - len(failures), "failures": failures,
                          "nativeParity": "failed" if failures else "verified-for-these-vectors"}, indent=2))
        return 1 if failures else 0
    except (OSError, ValueError, KeyError, TypeError, ImportError) as error:
        print(f"Portable contract runner failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
