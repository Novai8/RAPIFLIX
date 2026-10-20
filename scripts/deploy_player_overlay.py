#!/usr/bin/env python3
"""Deploy player.html to GitHub through the Contents REST API.

Required environment variables:
  GITHUB_TOKEN  A GitHub PAT with contents:write access.
  GITHUB_OWNER  Repository owner, for example Novai8.
  GITHUB_REPO   Repository name, for example RAPIFLIX.
Optional:
  GITHUB_PATH   Repository path; defaults to player.html.
  GITHUB_BRANCH Branch; defaults to main.
"""
from __future__ import annotations

import base64
import os
import sys
from pathlib import Path

import requests

COMMIT_MESSAGE = "feat: add custom Rapiflix branded player overlay mask"


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def main() -> int:
    token = required("GITHUB_TOKEN")
    owner = required("GITHUB_OWNER")
    repo = required("GITHUB_REPO")
    branch = os.getenv("GITHUB_BRANCH", "main").strip() or "main"
    remote_path = os.getenv("GITHUB_PATH", "player.html").strip() or "player.html"
    local_path = Path(os.getenv("PLAYER_HTML", "player.html"))
    if not local_path.is_file():
        raise SystemExit(f"Player file not found: {local_path}")

    # GitHub REST v3 Contents API endpoint:
    # https://api.github.com/repos/{owner}/{repo}/contents/{path}
    endpoint = f"https://api.github.com/repos/{owner}/{repo}/contents/{remote_path}"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    existing_sha = None
    response = requests.get(endpoint, headers=headers, params={"ref": branch}, timeout=30)
    if response.status_code == 200:
        existing_sha = response.json().get("sha")
    elif response.status_code != 404:
        response.raise_for_status()

    encoded = base64.b64encode(local_path.read_bytes()).decode("ascii")
    payload = {
        "message": COMMIT_MESSAGE,
        "content": encoded,
        "branch": branch,
    }
    if existing_sha:
        payload["sha"] = existing_sha

    update = requests.put(endpoint, headers=headers, json=payload, timeout=30)
    update.raise_for_status()
    result = update.json()
    print(result.get("commit", {}).get("html_url", "GitHub update completed"))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except requests.HTTPError as error:
        detail = error.response.text[:500] if error.response is not None else str(error)
        print(f"GitHub API request failed: {detail}", file=sys.stderr)
        raise
