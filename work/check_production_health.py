#!/usr/bin/env python3
"""Verify that the public webzine is serving the expected Git commit."""

from __future__ import annotations

import argparse
import json
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_URL = "https://archive-notes-webzine.vercel.app"


def fetch(url: str) -> tuple[int, bytes]:
    request = Request(
        url,
        headers={
            "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
            "User-Agent": "Paul-Archive-Webzine-Guard/1.0",
        },
    )
    with urlopen(request, timeout=20) as response:
        return response.status, response.read()


def check_once(base_url: str, expected_sha: str) -> tuple[bool, str]:
    health_url = f"{base_url.rstrip('/')}/api/health"
    home_url = f"{base_url.rstrip('/')}/"

    try:
        health_status, health_body = fetch(health_url)
        payload = json.loads(health_body.decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
        return False, f"health endpoint unavailable: {error}"

    deployed_sha = str(payload.get("commit", "")).strip()
    if health_status != 200 or payload.get("status") != "ok":
        return False, f"health endpoint returned an unhealthy response: {payload!r}"
    if payload.get("service") != "paul-archive-notes":
        return False, f"unexpected service identity: {payload.get('service')!r}"
    if deployed_sha != expected_sha:
        return False, f"production commit {deployed_sha or '<missing>'} != main {expected_sha}"

    try:
        home_status, home_body = fetch(home_url)
    except (HTTPError, URLError, TimeoutError) as error:
        return False, f"homepage unavailable: {error}"

    homepage = home_body.decode("utf-8", errors="replace")
    if home_status != 200 or "Paul Archive Notes" not in homepage:
        return False, f"homepage check failed with HTTP {home_status}"

    return True, f"production is healthy at {expected_sha}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--attempts", type=int, default=1)
    parser.add_argument("--delay", type=float, default=0)
    args = parser.parse_args()

    if args.attempts < 1:
        parser.error("--attempts must be at least 1")
    if args.delay < 0:
        parser.error("--delay cannot be negative")

    for attempt in range(1, args.attempts + 1):
        healthy, message = check_once(args.url, args.expected_sha)
        print(f"[{attempt}/{args.attempts}] {message}", flush=True)
        if healthy:
            return 0
        if attempt < args.attempts:
            time.sleep(args.delay)

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
