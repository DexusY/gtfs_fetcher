"""Endpoint-level tests for main.py via TestClient.

Auth and region-lookup dependencies are overridden and the ingest-status seam is
monkeypatched, so no DB or network is needed. TestClient is used without a
context manager on purpose — the lifespan (startup warmer) must not run.
"""
from __future__ import annotations

import io
import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main
from main import app


FAKE_ADMIN = SimpleNamespace(id=1, email="admin@test", role="admin")
FAKE_REGION = SimpleNamespace(id=1, static_url="http://x/gtfs.zip", rt_url=None)


def _png_bytes(width: int = 40, height: int = 20) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (255, 255, 255)).save(buf, format="PNG")
    return buf.getvalue()


async def _status_ready(region_id: int) -> str:
    return "ready"


async def _status_warming(region_id: int) -> str:
    return "warming"


async def _status_idle(region_id: int) -> str:
    return "idle"


@pytest.fixture
def client():
    app.dependency_overrides[main._get_current_user] = lambda: FAKE_ADMIN
    app.dependency_overrides[main._require_admin] = lambda: FAKE_ADMIN
    app.dependency_overrides[main._get_region] = lambda: FAKE_REGION
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def drain_warm_queue():
    yield
    while not main._warm_queue.empty():
        main._warm_queue.get_nowait()


# ---------------------------------------------------------------------------
# /render — input bounds and template validation
# ---------------------------------------------------------------------------

def test_render_rejects_oversized_dimensions(client):
    r = client.get("/render", params={"stop_id": "1", "width": 99999})
    assert r.status_code == 422


def test_render_rejects_tiny_dimensions(client):
    r = client.get("/render", params={"stop_id": "1", "height": 8})
    assert r.status_code == 422


def test_render_rejects_oversized_limit(client):
    r = client.get("/render", params={"stop_id": "1", "limit": 999})
    assert r.status_code == 422


def test_render_unknown_template_is_400(client):
    r = client.get("/render", params={"stop_id": "1", "template": "bogus"})
    assert r.status_code == 400
    assert "bogus" in r.json()["detail"]


def test_render_warming_region_is_503(client, monkeypatch):
    monkeypatch.setattr(main, "_ingest_status", _status_warming)
    r = client.get("/render", params={"stop_id": "1"})
    assert r.status_code == 503


# ---------------------------------------------------------------------------
# /render/custom — upload validation
# ---------------------------------------------------------------------------

def _post_custom(client, bg: bytes, layout: bytes):
    return client.post(
        "/render/custom",
        params={"region_id": 1, "stop_id": "1"},
        files={
            "background": ("bg.png", bg, "image/png"),
            "layout": ("layout.json", layout, "application/json"),
        },
    )


def test_custom_oversized_background_is_413(client, monkeypatch):
    monkeypatch.setattr(main, "_ingest_status", _status_ready)
    r = _post_custom(client, b"\x00" * (main._MAX_BG_BYTES + 1), b"{}")
    assert r.status_code == 413


def test_custom_non_image_background_is_400(client, monkeypatch):
    monkeypatch.setattr(main, "_ingest_status", _status_ready)
    r = _post_custom(client, b"this is not an image", b"{}")
    assert r.status_code == 400


def test_custom_invalid_layout_json_is_400(client, monkeypatch):
    monkeypatch.setattr(main, "_ingest_status", _status_ready)
    r = _post_custom(client, _png_bytes(), b"{not json")
    assert r.status_code == 400


def test_custom_layout_must_be_object(client, monkeypatch):
    monkeypatch.setattr(main, "_ingest_status", _status_ready)
    r = _post_custom(client, _png_bytes(), b"[1, 2, 3]")
    assert r.status_code == 400


def test_custom_warming_region_is_503(client, monkeypatch):
    monkeypatch.setattr(main, "_ingest_status", _status_warming)
    r = _post_custom(client, _png_bytes(), b"{}")
    assert r.status_code == 503


# ---------------------------------------------------------------------------
# /stops — warm-queue behaviour (regression for duplicate-ingest bug) + dedup
# ---------------------------------------------------------------------------

def test_stops_warming_returns_202_without_enqueueing(client, monkeypatch):
    """Polling while warming must NOT queue duplicate ingest jobs."""
    monkeypatch.setattr(main, "_ingest_status", _status_warming)
    r = client.get("/stops", params={"region_id": 1})
    assert r.status_code == 202
    assert main._warm_queue.empty()


def test_stops_idle_region_starts_ingest_once(client, monkeypatch):
    statuses = []

    async def fake_set_status(region_id, status, error=None):
        statuses.append((region_id, status))

    monkeypatch.setattr(main, "_ingest_status", _status_idle)
    monkeypatch.setattr(main, "_set_status", fake_set_status)
    r = client.get("/stops", params={"region_id": 1})
    assert r.status_code == 202
    assert statuses == [(1, "warming")]
    assert main._warm_queue.qsize() == 1


def test_stops_dedupes_stops_in_same_cell(client, monkeypatch):
    monkeypatch.setattr(main, "_ingest_status", _status_ready)
    monkeypatch.setattr(main.gtfs_store, "get_all_stops", lambda rid: [
        ("S1", "Same place A", 54.40001, 18.50001),
        ("S2", "Same place B", 54.40002, 18.50002),   # same 0.002° cell → dropped
        ("S3", "Elsewhere",    54.50000, 18.60000),
    ])
    r = client.get("/stops", params={"region_id": 1})
    assert r.status_code == 200
    assert [s["id"] for s in r.json()] == ["S1", "S3"]


# ---------------------------------------------------------------------------
# /auth/login rate limit + /users guards
# ---------------------------------------------------------------------------

def test_login_rate_limited_returns_429(client):
    now = time.monotonic()
    main._login_attempts["testclient"] = [now] * main._LOGIN_MAX_ATTEMPTS
    try:
        r = client.post("/auth/login", json={"email": "a@b.com", "password": "x"})
        assert r.status_code == 429
    finally:
        main._login_attempts.clear()


def test_create_user_rejects_invalid_email(client):
    r = client.post("/users", json={"email": "not-an-email", "password": "longenough"})
    assert r.status_code == 422


def test_create_user_rejects_short_password(client):
    r = client.post("/users", json={"email": "a@b.com", "password": "short"})
    assert r.status_code == 422


def test_create_user_rejects_unknown_role(client):
    r = client.post("/users", json={"email": "a@b.com", "password": "longenough", "role": "root"})
    assert r.status_code == 422


def test_admin_cannot_delete_own_account(client):
    r = client.delete(f"/users/{FAKE_ADMIN.id}")
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# /metrics gating
# ---------------------------------------------------------------------------

def test_metrics_hidden_without_configured_token(client, monkeypatch):
    monkeypatch.setattr(main, "_METRICS_TOKEN", "")
    assert client.get("/metrics").status_code == 404


def test_metrics_requires_matching_bearer_token(client, monkeypatch):
    monkeypatch.setattr(main, "_METRICS_TOKEN", "s3cret")
    assert client.get("/metrics").status_code == 404
    assert client.get("/metrics", headers={"Authorization": "Bearer wrong"}).status_code == 404
    r = client.get("/metrics", headers={"Authorization": "Bearer s3cret"})
    assert r.status_code == 200
    assert b"http" in r.content  # prometheus exposition text
