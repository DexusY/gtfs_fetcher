"""Create or update an admin user. Usage: python scripts/create_admin.py email [--role user]

Prompts for the password (never taken from argv, so it stays out of shell history).
Uses DATABASE_URL from the environment / .env.
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys

import bcrypt
import psycopg
from dotenv import load_dotenv


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("email")
    parser.add_argument("--role", choices=("admin", "user"), default="admin")
    args = parser.parse_args()

    password = getpass.getpass("Password: ")
    if len(password) < 8:
        print("Password must be at least 8 characters.", file=sys.stderr)
        return 1
    if password != getpass.getpass("Repeat password: "):
        print("Passwords do not match.", file=sys.stderr)
        return 1

    load_dotenv()
    dsn = os.environ["DATABASE_URL"].replace("+asyncpg", "")
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO users (email, password_hash, role) VALUES (%s, %s, %s)
               ON CONFLICT (email) DO UPDATE
                 SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role""",
            (args.email, hashed, args.role),
        )
    print(f"{args.role} account ready: {args.email}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
