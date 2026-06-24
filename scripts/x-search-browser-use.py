#!/usr/bin/env python3
"""Search X with browser-use using an already-authenticated Chrome profile.

This script intentionally does not extract or print cookies. It opens X in a
real browser session backed by the local Chrome profile and asks browser-use to
read the visible search results.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import tempfile
import urllib.parse
from pathlib import Path

os.environ.setdefault("ANONYMIZED_TELEMETRY", "false")
os.environ.setdefault("BROWSER_USE_CLOUD_SYNC", "false")

from browser_use import Agent, BrowserProfile, ChatOllama  # noqa: E402


DEFAULT_PROFILE = "/home/kojima/work/browser_agent/chrome-profile"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search X via browser-use and an authenticated Chrome profile.")
    parser.add_argument("query", help="X search query")
    parser.add_argument("-n", "--limit", type=int, default=8, help="Number of posts to summarize")
    parser.add_argument("--mode", choices=("top", "latest", "videos"), default="top")
    parser.add_argument("--profile", default=os.environ.get("BROWSER_USE_CHROME_PROFILE", DEFAULT_PROFILE))
    parser.add_argument("--cdp-url", default=os.environ.get("BROWSER_USE_CDP_URL", ""))
    parser.add_argument("--model", default=os.environ.get("BROWSER_USE_MODEL", "gemma4:12b-it-qat"))
    parser.add_argument("--host", default=os.environ.get("BROWSER_USE_OLLAMA_HOST", "http://127.0.0.1:11434"))
    parser.add_argument("--steps", type=int, default=int(os.environ.get("BROWSER_USE_X_SEARCH_STEPS", "18")))
    parser.add_argument("--headful", action="store_true", help="Show the browser window; requires DISPLAY/VNC")
    parser.add_argument("--json-out", default="", help="Optional path to save the JSON result")
    return parser.parse_args()


def copy_profile(src: Path) -> Path:
    tmp = Path(tempfile.mkdtemp(prefix="x-search-profile-"))
    shutil.copytree(
        src,
        tmp,
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns("Singleton*", "Crashpad", "ShaderCache", "GrShaderCache", "GraphiteDawnCache"),
    )
    return tmp


async def main() -> None:
    args = parse_args()
    query = args.query.strip()
    if not query:
        raise SystemExit(json.dumps({"ok": False, "error": "query is empty"}, ensure_ascii=False))

    search_url = "https://x.com/search?" + urllib.parse.urlencode({"q": query, "src": "typed_query"})
    if args.mode == "latest":
        search_url += "&f=live"
    elif args.mode == "videos":
        search_url += "&f=video"

    temp_profile: Path | None = None
    profile_kwargs = {
        "headless": not args.headful,
        "chromium_sandbox": False,
        "allowed_domains": ["x.com", "twitter.com"],
        "window_size": {"width": 1366, "height": 1000},
    }
    if args.cdp_url:
        profile_kwargs["cdp_url"] = args.cdp_url
    else:
        profile_path = Path(args.profile)
        if not profile_path.exists():
            raise SystemExit(json.dumps({"ok": False, "error": f"Chrome profile not found: {profile_path}"}, ensure_ascii=False))
        # Copy the profile so an existing Chrome/VNC session does not leave lock files
        # that make headless Chromium fail to start.
        temp_profile = copy_profile(profile_path)
        profile_kwargs["user_data_dir"] = str(temp_profile)
        profile_kwargs["profile_directory"] = "Default"

    task = f"""
You are operating an already-authenticated X.com browser session.
Open this X search URL:
{search_url}

If the account is not logged in, stop and report not_authenticated.
If X shows CAPTCHA, verification, or a login wall, stop and report the reason.

Read the visible search results and, if needed, scroll a little to collect up to {max(1, args.limit)} relevant posts.
Return only JSON, with this shape:
{{
  "ok": true,
  "query": "{query}",
  "mode": "{args.mode}",
  "results": [
    {{
      "author": "display name or handle if visible",
      "text": "post text summary, preserving concrete numbers/tools/claims",
      "url": "post URL if visible or empty",
      "why_relevant": "why this helps Web3/Codex/Claude Code monetization content"
    }}
  ],
  "notes": "short note about result quality"
}}
"""

    llm = ChatOllama(model=args.model, host=args.host, timeout=600)
    profile = BrowserProfile(**profile_kwargs)
    try:
        agent = Agent(task=task, llm=llm, browser_profile=profile, max_actions_per_step=3)
        history = await agent.run(max_steps=args.steps)
        final = str(history.final_result() or "").strip()
        result = {"ok": True, "query": query, "mode": args.mode, "raw": final}
        try:
            parsed = json.loads(final)
            if isinstance(parsed, dict):
                result = parsed
        except Exception:
            lowered = final.lower()
            if any(word in lowered for word in ("not_authenticated", "captcha", "verification", "login wall")):
                result["ok"] = False
        if args.json_out:
            Path(args.json_out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result.get("ok", False):
            raise SystemExit(1)
    finally:
        if temp_profile and temp_profile.exists():
            shutil.rmtree(temp_profile, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
