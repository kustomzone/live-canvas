#!/usr/bin/env python3
"""Send an email via SMTP, reading credentials from environment variables.

Credentials (from env, typically defined in ~/.zshrc):
  SMTP_HOST   e.g. smtp.163.com
  SMTP_PORT   e.g. 465 (SSL) or 587 (STARTTLS)
  SMTP_USER   login username / default From address, e.g. imcuttle@163.com
  SMTP_TOKEN  authorization code / app password (NOT the login password for 163/QQ)
  SMTP_FROM   optional, overrides From (defaults to SMTP_USER)

Usage:
  send_email.py --to a@x.com [--to b@y.com] --subject "Hi" --body "text"
  send_email.py --to a@x.com --subject "Hi" --body-file /path/to/body.txt
  echo "body from stdin" | send_email.py --to a@x.com --subject "Hi"
  # optional: --html  --cc  --bcc  --from
"""
import argparse
import os
import smtplib
import sys
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid


def env(name, required=True):
    val = os.environ.get(name, "").strip()
    if required and not val:
        sys.exit(f"ERROR: missing env var {name}. Define it (e.g. in ~/.zshrc) and reload.")
    return val


def main():
    p = argparse.ArgumentParser(description="Send email via SMTP using env credentials.")
    p.add_argument("--to", action="append", required=True, help="recipient (repeatable)")
    p.add_argument("--cc", action="append", default=[], help="cc (repeatable)")
    p.add_argument("--bcc", action="append", default=[], help="bcc (repeatable)")
    p.add_argument("--subject", default="", help="email subject")
    p.add_argument("--body", help="body text (inline)")
    p.add_argument("--body-file", help="read body from a file")
    p.add_argument("--html", action="store_true", help="treat body as HTML")
    p.add_argument("--from", dest="from_addr", help="override From address")
    args = p.parse_args()

    host = env("SMTP_HOST")
    port = int(env("SMTP_PORT"))
    user = env("SMTP_USER")
    token = env("SMTP_TOKEN")
    from_addr = args.from_addr or os.environ.get("SMTP_FROM", "").strip() or user

    # Resolve body: --body > --body-file > stdin
    if args.body is not None:
        body = args.body
    elif args.body_file:
        with open(args.body_file, "r", encoding="utf-8") as f:
            body = f.read()
    elif not sys.stdin.isatty():
        body = sys.stdin.read()
    else:
        body = ""

    subtype = "html" if args.html else "plain"
    msg = MIMEText(body, subtype, "utf-8")
    msg["Subject"] = args.subject
    msg["From"] = from_addr
    msg["To"] = ", ".join(args.to)
    if args.cc:
        msg["Cc"] = ", ".join(args.cc)
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid()

    recipients = args.to + args.cc + args.bcc

    if port == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=30)
    else:
        server = smtplib.SMTP(host, port, timeout=30)
        server.ehlo()
        server.starttls()
        server.ehlo()
    try:
        server.login(user, token)
        server.sendmail(from_addr, recipients, msg.as_string())
    finally:
        server.quit()

    print(f"OK: sent from {from_addr} to {', '.join(recipients)} via {host}:{port}")


if __name__ == "__main__":
    main()
