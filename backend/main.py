"""FastAPI backend for gtfs_app."""
from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Literal

import jwt
import uvicorn
from fastapi import FastAPI, File, HTTPException, Query, Depends, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt as _bcrypt
from PIL import Image
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel, EmailStr, Field, HttpUrl
from sqlalchemy import delete as sa_delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.future import select

from db.database import AsyncSessionLocal
from db.models import GtfsRegions, GtfsIngest, User
from src import gtfs_store
from src.fetcher import drop_shapes
from src.converter import convert
from src.processor import build_display_data
from src.render import render, TEMPLATES
from src.templates.custom_template.image import render_custom


_STATIC_TTL = timedelta(hours=float(os.getenv("GTFS_STATIC_TTL_HOURS", "24")))

# Regions queued for (re)ingest. The warmer drains this one at a time so only a
# single region's data is ever in flight — bounding peak RAM during ingest.
_warm_queue: "asyncio.Queue[int]" = asyncio.Queue()


async def _set_status(region_id: int, status: str, error: str | None = None) -> None:
    async with AsyncSessionLocal() as session:
        stmt = pg_insert(GtfsIngest).values(region_id=region_id, status=status, error=error)
        stmt = stmt.on_conflict_do_update(
            index_elements=[GtfsIngest.region_id],
            set_={"status": status, "error": error},
        )
        await session.execute(stmt)
        await session.commit()


async def _ingest_one(region_id: int) -> None:
    async with AsyncSessionLocal() as session:
        region = (await session.execute(
            select(GtfsRegions).where(GtfsRegions.id == region_id)
        )).scalar_one_or_none()
        row = (await session.execute(
            select(GtfsIngest).where(GtfsIngest.region_id == region_id)
        )).scalar_one_or_none()
    if region is None:
        return
    # Duplicate queue entries are possible (polling clients enqueue too);
    # skip if another entry already refreshed this region within the TTL.
    cutoff = datetime.now(timezone.utc) - _STATIC_TTL
    if row and row.loaded_at and row.loaded_at > cutoff:
        return
    await _set_status(region_id, "warming")
    try:
        await asyncio.to_thread(gtfs_store.ingest_region, region_id, region.static_url)
        drop_shapes(region_id)   # force the shapes LRU to reload fresh data
        logging.info(f"Region {region_id} ingested")
    except Exception as e:
        logging.exception(f"Ingest failed for region {region_id}")
        await _set_status(region_id, "failed", str(e))


async def _warmer() -> None:
    """Sequentially ingest queued regions, one at a time."""
    while True:
        region_id = await _warm_queue.get()
        try:
            await _ingest_one(region_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            logging.exception("warmer iteration failed")
        finally:
            _warm_queue.task_done()


async def _enqueue_stale_regions() -> None:
    """Queue every region whose static data is missing, failed, or older than the TTL.

    Freshness is decided by loaded_at, not status: loaded_at is written only on a
    fully committed atomic load, so a fresh timestamp means the data is intact even
    if status is still "warming". A "warming" row at startup is always a leftover
    from a crash/restart mid-ingest (no ingest survives a restart), so repair it to
    "ready" instead of re-downloading data that is already present and current.
    """
    cutoff = datetime.now(timezone.utc) - _STATIC_TTL
    async with AsyncSessionLocal() as session:
        regions = (await session.execute(select(GtfsRegions))).scalars().all()
        ingest = {
            r.region_id: r
            for r in (await session.execute(select(GtfsIngest))).scalars().all()
        }
    for r in regions:
        row = ingest.get(r.id)
        if row and row.loaded_at and row.loaded_at > cutoff:
            if row.status != "ready":
                await _set_status(r.id, "ready")
            continue
        _warm_queue.put_nowait(r.id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    warmer = asyncio.create_task(_warmer())
    await _enqueue_stale_regions()
    try:
        yield
    finally:
        warmer.cancel()
        try:
            await warmer
        except asyncio.CancelledError:
            pass
        await asyncio.to_thread(gtfs_store.close_pool)


app = FastAPI(title="gtfs_app", lifespan=lifespan)

_CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

Instrumentator().instrument(app)

# Metrics are exposed only when METRICS_TOKEN is set; scrapers must send it as a
# Bearer token. 404 (not 401) so the endpoint is invisible without the token.
_METRICS_TOKEN = os.getenv("METRICS_TOKEN", "")


@app.get("/metrics", include_in_schema=False)
async def metrics(request: Request):
    if not _METRICS_TOKEN or request.headers.get("authorization") != f"Bearer {_METRICS_TOKEN}":
        raise HTTPException(status_code=404)
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


_MIME = {"png": "image/png", "jpg": "image/jpeg", "epd": "application/octet-stream", "lz4": "application/octet-stream"}
_executor = ThreadPoolExecutor(max_workers=min(8, (os.cpu_count() or 4) * 2))

# Refuse to run with the historical default. JWTs are HS256, so any deployment
# that ships the placeholder secret is trivially forgeable.
SECRET_KEY = os.environ.get("JWT_SECRET", "")
if not SECRET_KEY or SECRET_KEY == "dev-secret-change-me":
    raise RuntimeError(
        "JWT_SECRET must be set to a strong, non-default value. "
        "Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(64))'"
    )
# JWT / auth config
ALGORITHM        = "HS256"
TOKEN_TTL_HOURS  = int(os.getenv("JWT_TTL_HOURS", "24"))
security         = HTTPBearer()


async def _start_ingest(region_id: int) -> None:
    """Mark a region warming and queue it. Only call from a cold state
    (idle/failed/new) — enqueueing while warming creates duplicate ingests."""
    await _set_status(region_id, "warming")
    _warm_queue.put_nowait(region_id)


async def _ingest_status(region_id: int) -> str:
    """Return 'ready' | 'warming' | 'failed' | 'idle' for a region."""
    async with AsyncSessionLocal() as session:
        row = (await session.execute(
            select(GtfsIngest).where(GtfsIngest.region_id == region_id)
        )).scalar_one_or_none()
    return row.status if row else "idle"


async def _require_ready(region_id: int) -> None:
    """Raise 503 while a region's static data is not ready, kicking off ingest if cold."""
    status = await _ingest_status(region_id)
    if status != "ready":
        if status in ("idle", "failed"):
            await _start_ingest(region_id)
        raise HTTPException(status_code=503, detail="GTFS data not ready — region is warming")


async def _get_region(region_id: int = Query(...)) -> SimpleNamespace:
    """Fetch the region or 404. Returns the plain namespace the sync pipeline expects."""
    async with AsyncSessionLocal() as session:
        row = (await session.execute(
            select(GtfsRegions).where(GtfsRegions.id == region_id)
        )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"region_id={region_id} not found")
    return SimpleNamespace(id=row.id, static_url=row.static_url, rt_url=row.rt_url)


# --- Auth helpers ---

def _hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt(rounds=12)).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return _bcrypt.checkpw(password.encode(), hashed.encode())


def _create_token(email: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=TOKEN_TTL_HOURS)).timestamp()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def _get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    async with AsyncSessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def _require_admin(user=Depends(_get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin required")
    return user


# --- Schemas ---

class LoginRequest(BaseModel):
    email: str
    password: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    role: Literal["user", "admin"] = "user"

class RegionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    country: str | None = None
    city: str | None = None
    # HttpUrl restricts feed URLs to http(s) — the backend fetches these
    # server-side, so bare schemes like file:// must never reach the fetcher.
    static_url: HttpUrl
    rt_url: HttpUrl | None = None


# --- Auth endpoints ---

# Per-IP sliding window for /auth/login. In-process on purpose: single backend
# instance, and bcrypt at cost 12 makes unthrottled attempts a CPU DoS too.
_LOGIN_WINDOW_S = 60.0
_LOGIN_MAX_ATTEMPTS = 10
_login_attempts: dict[str, list[float]] = {}

# Verified against on unknown emails so response time doesn't reveal whether
# an account exists (bcrypt runs either way).
_DUMMY_HASH = _hash_password("dummy-timing-equalizer")


def _login_rate_ok(ip: str) -> bool:
    now = time.monotonic()
    window = [t for t in _login_attempts.get(ip, []) if now - t < _LOGIN_WINDOW_S]
    ok = len(window) < _LOGIN_MAX_ATTEMPTS
    window.append(now)
    _login_attempts[ip] = window
    if len(_login_attempts) > 10_000:  # bound memory under address churn
        _login_attempts.clear()
    return ok


@app.post("/auth/login")
async def login(body: LoginRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    if not _login_rate_ok(ip):
        raise HTTPException(status_code=429, detail="Too many login attempts — try again later")
    async with AsyncSessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    hashed = user.password_hash if user else _DUMMY_HASH
    if not _verify_password(body.password, hashed) or not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": _create_token(user.email, user.role), "role": user.role}


@app.get("/auth/me")
async def me(user=Depends(_get_current_user)):
    return {"id": user.id, "email": user.email, "role": user.role}


# --- Users (admin) ---

@app.get("/users")
async def list_users(_=Depends(_require_admin)):
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(select(User))).scalars().all()
    return [{"id": r.id, "email": r.email, "role": r.role} for r in rows]


@app.post("/users", status_code=201)
async def create_user(body: UserCreate, _=Depends(_require_admin)):
    async with AsyncSessionLocal() as session:
        user = User(email=body.email, password_hash=_hash_password(body.password), role=body.role)
        session.add(user)
        try:
            await session.commit()
        except IntegrityError:
            raise HTTPException(status_code=409, detail="Email already registered")
        await session.refresh(user)
    return {"id": user.id, "email": user.email, "role": user.role}


@app.delete("/users/{user_id}")
async def delete_user(user_id: int, admin=Depends(_require_admin)):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    async with AsyncSessionLocal() as session:
        await session.execute(sa_delete(User).where(User.id == user_id))
        await session.commit()
    return {"ok": True}


# --- Regions ---

@app.get("/regions")
async def list_regions(_=Depends(_get_current_user)):
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(select(GtfsRegions))).scalars().all()
    return [{"id": r.id, "name": r.name, "country": r.country, "city": r.city,
             "static_url": r.static_url, "rt_url": r.rt_url} for r in rows]


@app.post("/regions")
async def create_region(body: RegionCreate, _=Depends(_require_admin)):
    async with AsyncSessionLocal() as session:
        region = GtfsRegions(**body.model_dump(mode="json"))  # Url objects → str for the ORM
        session.add(region)
        await session.commit()
        await session.refresh(region)
    await _start_ingest(region.id)
    return {"id": region.id, "name": region.name}


@app.delete("/regions/{region_id}")
async def delete_region(region_id: int, _=Depends(_require_admin)):
    async with AsyncSessionLocal() as session:
        await session.execute(sa_delete(GtfsRegions).where(GtfsRegions.id == region_id))
        await session.commit()
    return {"ok": True}


# --- Render ---

def _render_job(region, stop_id: str, template: str, width: int, height: int,
                orientation: str, lang: str, limit: int, fmt: str) -> bytes:
    data = build_display_data(region, stop_id, limit=limit)
    png = render(data, template=template, width=width, height=height,
                 orientation=orientation, lang=lang)
    return convert(png, fmt)


def _render_custom_job(region, stop_id: str, limit: int,
                       bg_bytes: bytes, layout: dict, fmt: str) -> bytes:
    data = build_display_data(region, stop_id, limit=limit)
    png  = render_custom(data, bg_bytes, layout)
    return convert(png, fmt)


@app.get("/regions/status")
async def regions_status(_=Depends(_get_current_user)):
    # has_shapes is recorded at ingest time; a DISTINCT over gtfs_shapes here
    # would scan the largest table on every poll.
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(select(GtfsRegions))).scalars().all()
        ingest = {
            r.region_id: r
            for r in (await session.execute(select(GtfsIngest))).scalars().all()
        }
    return {
        r.id: {
            "status": ingest[r.id].status if r.id in ingest else "idle",
            "has_shapes": bool(ingest[r.id].has_shapes) if r.id in ingest else False,
        }
        for r in rows
    }


@app.get("/stops")
async def list_stops(region=Depends(_get_region), _=Depends(_get_current_user)):
    region_id = region.id
    status = await _ingest_status(region_id)
    if status != "ready":
        # Only a cold region gets queued — re-enqueueing while "warming" would
        # pile duplicate jobs onto the warmer for every poll.
        if status in ("idle", "failed"):
            await _start_ingest(region_id)
        return JSONResponse(status_code=202, content={"status": "warming"})

    all_stops = await asyncio.to_thread(gtfs_store.get_all_stops, region_id)

    seen_cells: set[tuple[int, int]] = set()
    stops = []
    for sid, name, lat, lon in all_stops:
        cell = (int(lat / 0.002), int(lon / 0.002))
        if cell in seen_cells:
            continue
        seen_cells.add(cell)
        stops.append({"id": sid, "name": name, "lat": lat, "lon": lon})
    return stops


# Bounds for user-controlled render input. 4096² is comfortably above any
# e-paper panel while capping a single canvas at ~64 MB RGBA.
_MAX_DIM = 4096
_MAX_BG_BYTES = 5 * 1024 * 1024
_MAX_BG_PIXELS = _MAX_DIM * _MAX_DIM


@app.get("/render")
async def render_display(
    stop_id:     str = Query(...),
    format:      str = Query(default="png", pattern="^(png|jpg|epd|lz4)$"),
    template:    str = Query(default="rti_display"),
    width:       int = Query(default=1600, ge=64, le=_MAX_DIM),
    height:      int = Query(default=1200, ge=64, le=_MAX_DIM),
    orientation: str = Query(default="landscape", pattern="^(landscape|portrait)$"),
    lang:        str = Query(default="pl"),
    limit:       int = Query(default=10, ge=1, le=50),
    region=Depends(_get_region),
    _=Depends(_get_current_user),
):
    if template not in TEMPLATES:
        raise HTTPException(status_code=400,
                            detail=f"Unknown template {template!r}. Available: {', '.join(sorted(TEMPLATES))}")
    await _require_ready(region.id)

    loop = asyncio.get_event_loop()
    image_bytes = await loop.run_in_executor(
        _executor, _render_job,
        region, stop_id, template, width, height, orientation, lang, limit, format,
    )

    return Response(content=image_bytes, media_type=_MIME[format])


@app.post("/render/custom")
async def render_custom_display(
    background: UploadFile = File(...),
    layout:     UploadFile = File(...),
    stop_id:    str = Query(...),
    format:     str = Query(default="png", pattern="^(png|jpg|epd|lz4)$"),
    limit:      int = Query(default=8, ge=1, le=50),
    region=Depends(_get_region),
    _=Depends(_get_current_user),
):
    await _require_ready(region.id)

    bg_bytes = await background.read()
    if len(bg_bytes) > _MAX_BG_BYTES:
        raise HTTPException(status_code=413, detail="Background image too large (max 5 MB)")
    try:
        with Image.open(io.BytesIO(bg_bytes)) as probe:  # header only, no pixel decode
            w, h = probe.size
    except Exception:
        raise HTTPException(status_code=400, detail="Background is not a valid image")
    if w * h > _MAX_BG_PIXELS:
        raise HTTPException(status_code=413, detail="Background image dimensions too large")

    try:
        layout_data = json.loads(await layout.read())
        if not isinstance(layout_data, dict):
            raise ValueError("layout must be a JSON object")
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Layout is not valid JSON")

    loop = asyncio.get_event_loop()
    image_bytes = await loop.run_in_executor(
        _executor, _render_custom_job,
        region, stop_id, limit, bg_bytes, layout_data, format,
    )

    return Response(content=image_bytes, media_type=_MIME[format])


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
