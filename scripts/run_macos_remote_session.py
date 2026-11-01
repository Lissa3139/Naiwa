#!/usr/bin/env python3
"""Run a temporary, remote-enabled Mac pet session and stream safe status logs."""

import os
import queue
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path


def stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: run_macos_remote_session.py /path/to/Pet.app DURATION_MINUTES", file=sys.stderr)
        return 2
    if sys.platform != "darwin":
        print("The temporary remote session must run on macOS.", file=sys.stderr)
        return 2

    app = Path(sys.argv[1]).resolve()
    executable = app / "Contents" / "MacOS" / "Electron"
    try:
        duration = int(sys.argv[2])
    except ValueError:
        print("DURATION_MINUTES must be an integer.", file=sys.stderr)
        return 2
    if not 1 <= duration <= 60:
        print("DURATION_MINUTES must be between 1 and 60.", file=sys.stderr)
        return 2
    if not executable.is_file():
        print(f"App executable not found: {executable}", file=sys.stderr)
        return 2

    env = os.environ.copy()
    env["NAIWA_REMOTE_TEST"] = "1"
    env["NAIWA_REMOTE_TEST_MINUTES"] = str(duration)
    status_log = Path(env.get("RUNNER_TEMP", tempfile.gettempdir())) / "naiwa-remote-status.log"
    status_log.unlink(missing_ok=True)
    env["NAIWA_REMOTE_TEST_LOG"] = str(status_log)
    env["NAIWA_REMOTE_CONFIG_PATH"] = str(app.parent / "remote-control.ini")
    process = subprocess.Popen(
        [str(executable)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        env=env,
    )
    lines: queue.Queue[str | None] = queue.Queue()

    def read_output() -> None:
        assert process.stdout is not None
        for line in process.stdout:
            if not line.startswith("NAIWA_REMOTE_TEST "):
                lines.put(line)
        lines.put(None)

    threading.Thread(target=read_output, daemon=True).start()

    def print_line(line: str) -> None:
        print(line, end="", flush=True)

    seen_status_lines = 0

    def read_status_log() -> bool:
        nonlocal seen_status_lines
        try:
            contents = status_log.read_text(encoding="utf-8")
        except FileNotFoundError:
            return False
        status_lines = contents.splitlines()
        if contents and not contents.endswith("\n"):
            status_lines = status_lines[:-1]
        connected_now = False
        for line in status_lines[seen_status_lines:]:
            print(line, flush=True)
            if "STATUS=连接正常;" in line:
                connected_now = True
        seen_status_lines = len(status_lines)
        return connected_now

    print("Starting the Mac pet with remote control enabled.", flush=True)
    connected = False
    connect_deadline = time.monotonic() + 90
    while time.monotonic() < connect_deadline and process.poll() is None:
        connected = read_status_log() or connected
        if connected:
            break
        try:
            line = lines.get(timeout=0.5)
        except queue.Empty:
            continue
        if line is None:
            break
        print_line(line)
        if "NAIWA_REMOTE_STATUS=连接正常" in line:
            connected = True
            break

    if not connected:
        print("Mac pet did not connect within 90 seconds; ending the temporary run.", file=sys.stderr, flush=True)
        stop_process(process)
        return 1

    print(f"Remote Mac pet is online for up to {duration} minutes.", flush=True)
    session_deadline = time.monotonic() + duration * 60 + 120
    while process.poll() is None and time.monotonic() < session_deadline:
        read_status_log()
        try:
            line = lines.get(timeout=0.5)
        except queue.Empty:
            continue
        if line is not None:
            print_line(line)

    if process.poll() is None:
        print("Mac pet did not finish its timed cleanup; ending the temporary run.", file=sys.stderr, flush=True)
        stop_process(process)
        return 1
    return_code = process.wait()
    if return_code == 0:
        print("Temporary Mac remote session ended.", flush=True)
    else:
        print(f"Mac pet exited with code {return_code}.", file=sys.stderr, flush=True)
    return return_code


if __name__ == "__main__":
    raise SystemExit(main())
