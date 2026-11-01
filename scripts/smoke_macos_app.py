#!/usr/bin/env python3
"""Launch the packaged macOS pet and verify its first image renders."""

import subprocess
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: smoke_macos_app.py /path/to/Pet.app", file=sys.stderr)
        return 2
    app = Path(sys.argv[1]).resolve()
    executable = app / "Contents" / "MacOS" / "Electron"
    if sys.platform != "darwin":
        print("This smoke check must run on macOS.", file=sys.stderr)
        return 2
    if not executable.is_file():
        print(f"App executable not found: {executable}", file=sys.stderr)
        return 2

    try:
        result = subprocess.run(
            [str(executable), "--smoke-test"],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired as error:
        output = error.stdout or ""
        errors = error.stderr or ""
        if isinstance(output, bytes):
            output = output.decode(errors="replace")
        if isinstance(errors, bytes):
            errors = errors.decode(errors="replace")
        print(output, end="")
        print(errors, end="", file=sys.stderr)
        print("macOS app did not finish its launch check within 30 seconds.", file=sys.stderr)
        return 1

    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)
    if result.returncode != 0:
        print(f"macOS app launch check exited with {result.returncode}.", file=sys.stderr)
        return result.returncode or 1
    print("Packaged macOS app launched and rendered the pet image: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
