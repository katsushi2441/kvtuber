#!/usr/bin/env python3
"""Post to X by operating an already-authenticated Chrome profile with browser-use.

This intentionally does not extract or print cookies. It reuses the local
browser profile/session and lets X handle the logged-in browser state.
"""

import argparse
import asyncio
import json
import os
from pathlib import Path

os.environ.setdefault("ANONYMIZED_TELEMETRY", "false")
os.environ.setdefault("BROWSER_USE_CLOUD_SYNC", "false")

from browser_use import Agent, BrowserProfile, ChatOllama  # noqa: E402


DEFAULT_PROFILE = "/home/kojima/work/browser_agent/chrome-profile"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", required=True, help="X post text")
    parser.add_argument("--profile", default=os.environ.get("BROWSER_USE_CHROME_PROFILE", DEFAULT_PROFILE))
    parser.add_argument("--cdp-url", default=os.environ.get("BROWSER_USE_CDP_URL", ""))
    parser.add_argument("--model", default=os.environ.get("BROWSER_USE_MODEL", "gemma4:12b-it-qat"))
    parser.add_argument("--host", default=os.environ.get("BROWSER_USE_OLLAMA_HOST", "http://192.168.0.14:11434"))
    parser.add_argument("--steps", type=int, default=int(os.environ.get("BROWSER_USE_X_STEPS", "12")))
    parser.add_argument("--headful", action="store_true", help="Show the browser window; requires DISPLAY/VNC")
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    text = args.text.strip()
    if not text:
        raise SystemExit(json.dumps({"ok": False, "error": "text is empty"}, ensure_ascii=False))

    profile_kwargs = {
        "headless": not args.headful,
        "chromium_sandbox": False,
        "allowed_domains": ["x.com", "twitter.com"],
        "window_size": {"width": 1280, "height": 900},
    }
    if args.cdp_url:
        profile_kwargs["cdp_url"] = args.cdp_url
    else:
        profile_path = Path(args.profile)
        if not profile_path.exists():
            raise SystemExit(
                json.dumps(
                    {"ok": False, "error": f"Chrome profile not found: {profile_path}"},
                    ensure_ascii=False,
                )
            )
        profile_kwargs["user_data_dir"] = str(profile_path)
        profile_kwargs["profile_directory"] = "Default"

    llm = ChatOllama(model=args.model, host=args.host, timeout=600)
    profile = BrowserProfile(**profile_kwargs)
    task = f"""
You are operating an already-authenticated X.com browser session.
Open https://x.com/compose/post .
If the account is not logged in, stop and report not_authenticated.
Post exactly the following text, without adding or removing anything:

<<<POST_TEXT
{text}
POST_TEXT>>>

Before clicking the final Post button, verify the composed text is exactly the POST_TEXT.
Pay special attention that the first word is exactly "Kurage", not "KKurage".
If the text is different, clear the composer and re-enter the exact POST_TEXT once.
After clicking the final Post button, confirm the post is submitted.
If X shows a CAPTCHA, verification, or login screen, stop and report the reason.
"""
    agent = Agent(task=task, llm=llm, browser_profile=profile, max_actions_per_step=3)
    history = await agent.run(max_steps=args.steps)
    final = str(history.final_result() or "")
    lowered = final.lower()
    ok = not any(word in lowered for word in ("not_authenticated", "captcha", "verification", "login required", "failed"))
    print(json.dumps({"ok": ok, "result": final[:2000]}, ensure_ascii=False))
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
