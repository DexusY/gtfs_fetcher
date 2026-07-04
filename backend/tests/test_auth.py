"""Tests for JWT auth helpers in main.py — password hashing and token creation.

These helpers are pure functions with no DB calls, so they can be tested in
isolation by importing main directly. The module-level JWT_SECRET check in main.py
is satisfied by the project's .env file loaded at import time.
"""
from __future__ import annotations

import time

import jwt
import pytest

import main
from main import (
    _create_token, _hash_password, _login_rate_ok, _verify_password,
    ALGORITHM, SECRET_KEY,
)


# ---------------------------------------------------------------------------
# _hash_password / _verify_password
# ---------------------------------------------------------------------------

def test_hash_is_not_stored_as_plaintext():
    """bcrypt output must never match the original string."""
    assert _hash_password("hunter2") != "hunter2"


def test_correct_password_verifies():
    hashed = _hash_password("correct-horse-battery-staple")
    assert _verify_password("correct-horse-battery-staple", hashed) is True


def test_wrong_password_rejected():
    hashed = _hash_password("right-password")
    assert _verify_password("wrong-password", hashed) is False


def test_hash_salt_is_random():
    """Two hashes of the same password must differ — bcrypt generates a fresh salt each call."""
    h1 = _hash_password("same")
    h2 = _hash_password("same")
    assert h1 != h2


def test_empty_password_round_trips():
    hashed = _hash_password("")
    assert _verify_password("", hashed) is True
    assert _verify_password("not-empty", hashed) is False


# ---------------------------------------------------------------------------
# _create_token
# ---------------------------------------------------------------------------

def test_token_decodes_to_correct_claims():
    """A freshly minted token must decode back to the email and role it was created with."""
    token = _create_token("alice@example.com", "admin")
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == "alice@example.com"
    assert payload["role"] == "admin"


def test_token_has_iat_and_exp():
    before = int(time.time())
    token = _create_token("u@x.com", "user")
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["iat"] >= before
    assert payload["exp"] > payload["iat"]


def test_token_exp_is_roughly_24h_ahead():
    """Default TTL is 24 h — exp must be at least 23 h from now to guard against off-by-one."""
    token = _create_token("u@x.com", "user")
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    remaining = payload["exp"] - int(time.time())
    assert remaining > 23 * 3600, f"expected >23 h remaining, got {remaining / 3600:.1f} h"


def test_token_role_preserved_for_each_role():
    for role in ("admin", "user"):
        payload = jwt.decode(_create_token("a@b.com", role), SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["role"] == role


def test_token_signed_with_project_secret():
    """A token signed with a different key must be rejected — HS256 is not just encoding."""
    token = _create_token("u@x.com", "user")
    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(token, "wrong-secret", algorithms=[ALGORITHM])


# ---------------------------------------------------------------------------
# login rate limiter
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def clear_rate_limiter():
    main._login_attempts.clear()
    yield
    main._login_attempts.clear()


def test_rate_limiter_allows_up_to_max_attempts():
    for _ in range(main._LOGIN_MAX_ATTEMPTS):
        assert _login_rate_ok("10.0.0.1") is True


def test_rate_limiter_blocks_after_max_attempts():
    for _ in range(main._LOGIN_MAX_ATTEMPTS):
        _login_rate_ok("10.0.0.1")
    assert _login_rate_ok("10.0.0.1") is False


def test_rate_limiter_is_per_ip():
    for _ in range(main._LOGIN_MAX_ATTEMPTS):
        _login_rate_ok("10.0.0.1")
    assert _login_rate_ok("10.0.0.2") is True


def test_rate_limiter_window_expires(monkeypatch):
    """Attempts older than the window must not count against the limit."""
    for _ in range(main._LOGIN_MAX_ATTEMPTS):
        _login_rate_ok("10.0.0.1")
    real_monotonic = time.monotonic
    monkeypatch.setattr(main.time, "monotonic",
                        lambda: real_monotonic() + main._LOGIN_WINDOW_S + 1)
    assert _login_rate_ok("10.0.0.1") is True
