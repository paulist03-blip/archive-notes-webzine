#!/usr/bin/env python3
import base64
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


TEAM_ID = "team_DYA5a499B4NAp6TpyMTthaSM"
PROJECT_NAME = "archive-notes-webzine"
PROJECT_ID = "prj_bRt6qseBF9gQcyj7SvwTBDoyK3Wg"
ROOT = Path(__file__).resolve().parents[1]


HTML_FILES = [
    ROOT / "index.html",
    ROOT / "forum.html",
    ROOT / "daily-ai-work.html",
    *sorted((ROOT / "posts").glob("*.html")),
]


def is_external_ref(value):
    return value.startswith(("http", "#", "mailto:", "tel:", "javascript:", "data:"))


def is_within_root(path):
    resolved_root = ROOT.resolve()
    resolved_path = path.resolve()
    return resolved_path == resolved_root or resolved_root in resolved_path.parents


def collect_local_refs(path):
    text = path.read_text(encoding="utf-8")
    refs = []
    for attr in ("href", "src"):
        refs.extend(re.findall(fr'{attr}="([^"]+)"', text))
    if path.suffix == ".css":
        refs.extend(re.findall(r'url\(["\']?([^)"\']+)["\']?\)', text))

    targets = []
    for value in refs:
        value = html.unescape(value).strip()
        if not value or is_external_ref(value):
            continue
        clean = value.split("#", 1)[0].split("?", 1)[0]
        if not clean:
            continue
        target = (path.parent / clean).resolve()
        if is_within_root(target) and target.is_file():
            targets.append(target)
    return targets


def build_deploy_files():
    files = {path.resolve() for path in HTML_FILES}
    queue = list(files)

    while queue:
        current = queue.pop(0)
        if current.suffix not in {".html", ".css"}:
            continue
        for target in collect_local_refs(current):
            if target not in files:
                files.add(target)
                queue.append(target)

    return sorted(files, key=lambda path: str(path.relative_to(ROOT)))


DEPLOY_FILES = build_deploy_files()


def api_request(method, url, token, payload=None):
    data = None
    headers = {"Authorization": f"Bearer {token}"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"error": body}
        return exc.code, parsed


def main():
    token = os.environ.get("VERCEL_TOKEN") or sys.stdin.readline().strip()
    if not token:
        raise SystemExit("Missing Vercel token on stdin")
    missing = [str(path) for path in DEPLOY_FILES if not path.exists()]
    if missing:
        raise SystemExit(f"Missing deploy files: {missing}")

    files = []
    for path in DEPLOY_FILES:
        files.append(
            {
                "file": str(path.relative_to(ROOT)),
                "data": base64.b64encode(path.read_bytes()).decode("ascii"),
                "encoding": "base64",
            }
        )

    create_url = f"https://api.vercel.com/v13/deployments?teamId={TEAM_ID}"
    payload = {
        "name": PROJECT_NAME,
        "project": PROJECT_ID,
        "target": "production",
        "files": files,
        "projectSettings": {
            "framework": None,
            "buildCommand": None,
            "devCommand": None,
            "installCommand": None,
            "outputDirectory": ".",
        },
    }

    status, created = api_request("POST", create_url, token, payload)
    if status >= 400:
        print(json.dumps({"status": status, "response": created}, ensure_ascii=False, indent=2))
        raise SystemExit(1)

    deployment_id = created.get("id") or created.get("deployment", {}).get("id")
    url = created.get("url") or created.get("alias", [None])[0]
    ready_state = created.get("readyState") or created.get("status")

    result = {
        "id": deployment_id,
        "url": f"https://{url}" if url and not url.startswith("http") else url,
        "readyState": ready_state,
    }

    if deployment_id:
        get_url = f"https://api.vercel.com/v13/deployments/{deployment_id}?teamId={TEAM_ID}"
        for _ in range(18):
            time.sleep(3)
            poll_status, deployment = api_request("GET", get_url, token)
            if poll_status >= 400:
                result["pollError"] = deployment
                break
            result["readyState"] = deployment.get("readyState") or deployment.get("status")
            poll_url = deployment.get("url")
            if poll_url:
                result["url"] = f"https://{poll_url}" if not poll_url.startswith("http") else poll_url
            aliases = deployment.get("alias") or []
            if aliases:
                result["alias"] = f"https://{aliases[0]}" if not aliases[0].startswith("http") else aliases[0]
            if result["readyState"] in {"READY", "ERROR", "CANCELED"}:
                break

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
