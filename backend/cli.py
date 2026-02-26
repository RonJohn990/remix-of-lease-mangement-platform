"""
Backend CLI utilities for local-first Flask/SQLite app.

Usage:
  python3 -m backend.cli admin status
  python3 -m backend.cli admin create --email ... --full-name ... [--password ...]
  python3 -m backend.cli admin promote --email ...
  python3 -m backend.cli admin delete --yes
  python3 -m backend.cli admin reset --email ... --full-name ... [--password ...] --yes

Exit codes:
  0 = success
  1 = runtime error (unexpected)
  2 = usage / invalid input
  3 = not found / cannot complete requested action
"""

from __future__ import annotations

import argparse
import sys
from getpass import getpass
from typing import Optional

from werkzeug.security import generate_password_hash

from .app import create_app, db, Profile, UserRole


# ----------------------------
# Helpers
# ----------------------------

def _exit(code: int, msg: Optional[str] = None) -> None:
    if msg:
        stream = sys.stderr if code != 0 else sys.stdout
        print(msg, file=stream)
    raise SystemExit(code)


def _app_context():
    app = create_app()
    return app.app_context()


def _ensure_db_initialized() -> None:
    # Make sure tables exist (create_app() does db.create_all() in its factory)
    # but calling create_all again is safe.
    db.create_all()


def _admin_exists() -> bool:
    return UserRole.query.filter_by(role="admin").first() is not None


def _get_profile_by_email(email: str) -> Optional[Profile]:
    return Profile.query.filter_by(email=email).first()


def _has_admin_role(user_id: str) -> bool:
    return UserRole.query.filter_by(user_id=user_id, role="admin").first() is not None


def _grant_admin_role(user_id: str) -> bool:
    """
    Returns True if role was added, False if it already existed.
    """
    if _has_admin_role(user_id):
        return False
    db.session.add(UserRole(user_id=user_id, role="admin"))
    db.session.commit()
    return True


# ----------------------------
# Commands
# ----------------------------

def cmd_admin_status(_args: argparse.Namespace) -> None:
    exists = _admin_exists()
    if exists:
        print("Admin exists: yes")
        _exit(0)
    print("Admin exists: no (setup required)")
    _exit(0)


def cmd_admin_create(args: argparse.Namespace) -> None:
    email = (args.email or "").strip()
    full_name = (args.full_name or "").strip()

    if not email or not full_name:
        _exit(2, "error: --email and --full-name are required")

    if _admin_exists():
        _exit(3, "error: admin already exists (use 'admin promote' or login)")

    password = args.password
    if not password:
        password = getpass("Password (min 8 chars): ")

    if len(password) < 8:
        _exit(2, "error: password must be at least 8 characters")

    if _get_profile_by_email(email):
        _exit(3, "error: a user with this email already exists")

    # Create the initial admin user
    from .app import gen_uuid  # avoid circular import surprises

    user_id = gen_uuid()
    profile = Profile(
        user_id=user_id,
        email=email,
        full_name=full_name,
        password_hash=generate_password_hash(password),
    )
    db.session.add(profile)
    db.session.add(UserRole(user_id=user_id, role="admin"))
    db.session.commit()

    print("success: admin created")
    _exit(0)


def cmd_admin_promote(args: argparse.Namespace) -> None:
    email = (args.email or "").strip()
    if not email:
        _exit(2, "error: --email is required")

    profile = _get_profile_by_email(email)
    if not profile:
        _exit(3, f"error: user not found for email: {email}")

    added = _grant_admin_role(profile.user_id)
    if not added:
        print("success: user is already an admin (no-op)")
        _exit(0)

    print("success: user promoted to admin")
    _exit(0)


def cmd_admin_delete(args: argparse.Namespace) -> None:
    if not args.yes:
        _exit(2, "error: refusing to delete admin roles without --yes")

    deleted = UserRole.query.filter_by(role="admin").delete()
    db.session.commit()

    print(f"success: removed admin roles ({deleted} row(s))")
    _exit(0)


def cmd_admin_reset(args: argparse.Namespace) -> None:
    if not args.yes:
        _exit(2, "error: refusing to reset admin without --yes")

    email = (args.email or "").strip()
    full_name = (args.full_name or "").strip()
    if not email or not full_name:
        _exit(2, "error: --email and --full-name are required")

    password = args.password
    if not password:
        password = getpass("Password (min 8 chars): ")

    if len(password) < 8:
        _exit(2, "error: password must be at least 8 characters")

    # Remove all admins first
    UserRole.query.filter_by(role="admin").delete()
    db.session.commit()

    # If user exists, just promote; otherwise create and promote
    profile = _get_profile_by_email(email)
    if profile:
        profile.full_name = full_name or profile.full_name
        profile.password_hash = generate_password_hash(password)
        db.session.commit()
        _grant_admin_role(profile.user_id)
        print("success: admin reset (existing user updated + promoted)")
        _exit(0)

    from .app import gen_uuid
    user_id = gen_uuid()
    profile = Profile(
        user_id=user_id,
        email=email,
        full_name=full_name,
        password_hash=generate_password_hash(password),
    )
    db.session.add(profile)
    db.session.add(UserRole(user_id=user_id, role="admin"))
    db.session.commit()

    print("success: admin reset (new admin created)")
    _exit(0)


# ----------------------------
# CLI entrypoint
# ----------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python3 -m backend.cli")
    sub = p.add_subparsers(dest="command")

    admin = sub.add_parser("admin", help="Admin management commands")
    admin_sub = admin.add_subparsers(dest="admin_command")

    st = admin_sub.add_parser("status", help="Show whether an admin exists")
    st.set_defaults(func=cmd_admin_status)

    create = admin_sub.add_parser("create", help="Create the first admin (only if none exists)")
    create.add_argument("--email", required=True)
    create.add_argument("--full-name", required=True)
    create.add_argument("--password", required=False, help="If omitted, you will be prompted")
    create.set_defaults(func=cmd_admin_create)

    promote = admin_sub.add_parser("promote", help="Promote an existing user to admin by email")
    promote.add_argument("--email", required=True)
    promote.set_defaults(func=cmd_admin_promote)

    delete = admin_sub.add_parser("delete", help="Remove ALL admin roles (dangerous)")
    delete.add_argument("--yes", action="store_true", help="Confirm destructive action")
    delete.set_defaults(func=cmd_admin_delete)

    reset = admin_sub.add_parser("reset", help="Delete all admins then create/promote one admin")
    reset.add_argument("--email", required=True)
    reset.add_argument("--full-name", required=True)
    reset.add_argument("--password", required=False, help="If omitted, you will be prompted")
    reset.add_argument("--yes", action="store_true", help="Confirm destructive action")
    reset.set_defaults(func=cmd_admin_reset)

    return p


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command != "admin" or not getattr(args, "admin_command", None):
        parser.print_help()
        return 2

    try:
        with _app_context():
            _ensure_db_initialized()
            args.func(args)
            return 0
    except SystemExit as e:
        return int(e.code)
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())