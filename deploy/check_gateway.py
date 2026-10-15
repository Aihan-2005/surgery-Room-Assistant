"""Verify published Caddy ports locally, preserving the public HTTP/TLS identity."""

import json
import subprocess
import sys
import time
from urllib.parse import urlsplit


def fetch(origin, path):
    result = subprocess.run(
        [
            "curl", "--fail", "--silent", "--show-error", "--noproxy", "*",
            "--connect-timeout", "5", "--max-time", "10",
            # Empty source host/port matches the URL; empty destination port
            # preserves its port. Host, SNI and certificate checks are unchanged.
            "--connect-to", "::127.0.0.1:", origin.rstrip("/") + path,
        ],
        check=True, capture_output=True, text=True, timeout=15,
    )
    return result.stdout


def check_gateway(origin, attempts=12, delay=5):
    url = urlsplit(origin)
    if (
        url.scheme not in ("http", "https") or not url.hostname
        or url.username is not None or url.password is not None
        or url.path not in ("", "/") or url.query or url.fragment
    ):
        raise ValueError("APP_ORIGIN must be an HTTP(S) origin without credentials or a path")

    last_error = "Gateway verification did not run"
    for attempt in range(attempts):
        try:
            fetch(origin, "/")
            health = json.loads(fetch(origin, "/api/backend-health"))
            if not isinstance(health, dict) or not all(
                health.get(key) is True
                for key in ("configured", "reachable", "databaseReady")
            ):
                raise ValueError("Gateway could not reach the application/database")
            return
        except subprocess.CalledProcessError as error:
            last_error = error.stderr.strip() or f"curl exited with status {error.returncode}"
        except (subprocess.TimeoutExpired, ValueError) as error:
            last_error = str(error)
        if attempt + 1 < attempts:
            time.sleep(delay)
    raise RuntimeError(last_error)


def main():
    # Compose JSON includes secrets. Extract only the public origin; never print
    # the input or pass credentials into the curl command.
    config = json.load(sys.stdin)
    origin = config["services"]["frontend"]["environment"]["APP_ORIGIN"]
    check_gateway(origin)
    print("Local gateway homepage and backend health passed")
    print("Check the public URL separately from another device/network.")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, TypeError, ValueError, RuntimeError, OSError) as error:
        print(f"Gateway verification failed: {error}", file=sys.stderr)
        sys.exit(1)
