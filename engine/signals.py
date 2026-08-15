from __future__ import annotations

import asyncio
import json
import os
import traceback
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, List, Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from supabase import create_client


router = APIRouter(
    prefix="/api/signals",
    tags=["whisper"],
)


supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_KEY"],
)


# ---------------------------------------------------------------------------
# Models accepted by your existing batch ingestion endpoint
# ---------------------------------------------------------------------------

class SignalReading(BaseModel):
    signal_type: str

    lat: float
    lon: float
    altitude: Optional[float] = None

    frequency_hz: Optional[float] = None
    rssi_dbm: Optional[float] = None

    ssid: Optional[str] = None
    mac_address: Optional[str] = None
    channel: Optional[int] = None

    center_freq_hz: Optional[float] = None
    bandwidth_hz: Optional[float] = None
    psd_peak_dbm: Optional[float] = None

    device_id: Optional[str] = None
    notes: Optional[str] = None


class ScanBatch(BaseModel):
    scan_session: Optional[str] = None
    readings: List[SignalReading]


# ---------------------------------------------------------------------------
# Model accepted by the new single-observation endpoint
# ---------------------------------------------------------------------------

class IncomingObservation(BaseModel):
    id: Optional[str] = None
    session_id: str

    observed_at: Optional[datetime] = None

    signal_type: str = "unknown"
    display_name: Optional[str] = None
    label: Optional[str] = None
    protocol: Optional[str] = None
    modulation: Optional[str] = None

    frequency_hz: Optional[float] = None
    bandwidth_hz: Optional[float] = None
    channel: Optional[int] = None

    rssi_dbm: Optional[float] = None
    snr_db: Optional[float] = None
    noise_dbm: Optional[float] = None

    node_id: Optional[str] = None

    receiver_lat: float
    receiver_lon: float
    receiver_altitude: Optional[float] = None

    bearing_deg: Optional[float] = None
    bearing_uncertainty_deg: Optional[float] = None

    estimated_lat: Optional[float] = None
    estimated_lon: Optional[float] = None
    location_accuracy_m: Optional[float] = None

    classification_confidence: Optional[float] = Field(
        default=None,
        ge=0,
        le=1,
    )


class DemoSignalRequest(BaseModel):
    session_id: str = "demo-session"
    node_id: str = "my-mac"
    receiver_lat: float = 40.7128
    receiver_lon: float = -74.0060


# ---------------------------------------------------------------------------
# Live SSE subscribers
#
# This works when you run one API process. If you later run multiple Uvicorn
# workers or multiple servers, replace this with Redis pub/sub.
# ---------------------------------------------------------------------------

subscribers: dict[
    str,
    set[asyncio.Queue[dict[str, Any]]],
] = defaultdict(set)


def model_to_dict(model: BaseModel) -> dict[str, Any]:
    """
    Supports both Pydantic v1 and Pydantic v2.
    """

    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_none=True)

    return model.dict(exclude_none=True)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_signal_type(value: Optional[str]) -> str:
    value = (value or "unknown").strip().lower()

    aliases = {
        "wi-fi": "wifi",
        "ble": "bluetooth",
        "bt": "bluetooth",
        "rf": "radio",
        "sdr": "radio",
        "cell": "cellular",
        "lte": "cellular",
        "5g": "cellular",
        "lorawan": "lora",
    }

    return aliases.get(value, value)


def parse_notes(value: Any) -> dict[str, Any]:
    """
    Direction and classification metadata is stored as JSON inside the
    existing notes column, avoiding an immediate database migration.
    """

    if isinstance(value, dict):
        return value

    if not isinstance(value, str) or not value.strip():
        return {}

    try:
        decoded = json.loads(value)

        if isinstance(decoded, dict):
            return decoded
    except json.JSONDecodeError:
        return {"text": value}

    return {}


def make_notes(metadata: dict[str, Any]) -> Optional[str]:
    cleaned = {
        key: value
        for key, value in metadata.items()
        if value is not None
    }

    if not cleaned:
        return None

    return json.dumps(
        cleaned,
        separators=(",", ":"),
    )


def row_to_frontend(row: dict[str, Any]) -> dict[str, Any]:
    """
    Convert your current Supabase row shape into the shape expected by
    the Whisper Map frontend.
    """

    metadata = parse_notes(row.get("notes"))

    frequency_hz = (
        row.get("frequency_hz")
        or row.get("center_freq_hz")
    )

    rssi_dbm = row.get("rssi_dbm")

    if rssi_dbm is None:
        rssi_dbm = row.get("psd_peak_dbm")

    display_name = (
        metadata.get("display_name")
        or row.get("ssid")
        or metadata.get("label")
        or normalize_signal_type(row.get("signal_type")).upper()
    )

    return {
        "id": str(
            row.get("id")
            or metadata.get("id")
            or uuid.uuid4()
        ),
        "session_id": row.get("scan_session"),
        "observed_at": (
            row.get("created_at")
            or metadata.get("observed_at")
            or utc_now_iso()
        ),

        "signal_type": normalize_signal_type(
            row.get("signal_type")
        ),

        "display_name": display_name,
        "label": metadata.get("label"),
        "protocol": metadata.get("protocol"),
        "modulation": metadata.get("modulation"),

        "frequency_hz": frequency_hz,
        "bandwidth_hz": row.get("bandwidth_hz"),
        "channel": row.get("channel"),

        "rssi_dbm": rssi_dbm,
        "snr_db": metadata.get("snr_db"),
        "noise_dbm": metadata.get("noise_dbm"),

        "node_id": (
            row.get("device_id")
            or metadata.get("node_id")
            or "unknown-node"
        ),

        "receiver_lat": row.get("lat"),
        "receiver_lon": row.get("lon"),
        "receiver_altitude": row.get("altitude"),

        "bearing_deg": metadata.get("bearing_deg"),
        "bearing_uncertainty_deg": metadata.get(
            "bearing_uncertainty_deg"
        ),

        "estimated_lat": metadata.get("estimated_lat"),
        "estimated_lon": metadata.get("estimated_lon"),
        "location_accuracy_m": metadata.get(
            "location_accuracy_m"
        ),

        "classification_confidence": metadata.get(
            "classification_confidence"
        ),

        "ssid": row.get("ssid"),
        "mac_address": row.get("mac_address"),
    }


def observation_to_database_row(
    observation: IncomingObservation,
) -> dict[str, Any]:
    """
    Convert the new frontend-friendly event format into your existing
    signal_scans table columns.
    """

    metadata = {
        "id": observation.id or str(uuid.uuid4()),
        "observed_at": (
            observation.observed_at.isoformat()
            if observation.observed_at
            else utc_now_iso()
        ),
        "display_name": observation.display_name,
        "label": observation.label,
        "protocol": observation.protocol,
        "modulation": observation.modulation,
        "node_id": observation.node_id,
        "snr_db": observation.snr_db,
        "noise_dbm": observation.noise_dbm,
        "bearing_deg": (
            observation.bearing_deg % 360
            if observation.bearing_deg is not None
            else None
        ),
        "bearing_uncertainty_deg": (
            observation.bearing_uncertainty_deg
        ),
        "estimated_lat": observation.estimated_lat,
        "estimated_lon": observation.estimated_lon,
        "location_accuracy_m": (
            observation.location_accuracy_m
        ),
        "classification_confidence": (
            observation.classification_confidence
        ),
    }

    return {
        "scan_session": observation.session_id,
        "signal_type": normalize_signal_type(
            observation.signal_type
        ),

        "lat": observation.receiver_lat,
        "lon": observation.receiver_lon,
        "altitude": observation.receiver_altitude,

        "frequency_hz": observation.frequency_hz,
        "rssi_dbm": observation.rssi_dbm,

        # The existing table has an ssid field. For Wi-Fi, store the
        # display name there as well.
        "ssid": (
            observation.display_name
            if normalize_signal_type(
                observation.signal_type
            ) == "wifi"
            else None
        ),

        "mac_address": None,
        "channel": observation.channel,

        "center_freq_hz": observation.frequency_hz,
        "bandwidth_hz": observation.bandwidth_hz,
        "psd_peak_dbm": observation.rssi_dbm,

        "device_id": observation.node_id,
        "notes": make_notes(metadata),
    }


async def publish_live(
    session_id: str,
    observation: dict[str, Any],
) -> None:
    queues = list(subscribers.get(session_id, set()))

    for queue in queues:
        try:
            queue.put_nowait(observation)
        except asyncio.QueueFull:
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass

            try:
                queue.put_nowait(observation)
            except asyncio.QueueFull:
                pass


# ---------------------------------------------------------------------------
# Existing batch ingest endpoint
# ---------------------------------------------------------------------------

@router.post("/ingest")
async def ingest_signals(batch: ScanBatch):
    try:
        session_id = (
            batch.scan_session
            or str(uuid.uuid4())
        )

        rows: list[dict[str, Any]] = []

        for reading in batch.readings:
            row = model_to_dict(reading)
            row["scan_session"] = session_id
            row["signal_type"] = normalize_signal_type(
                row.get("signal_type")
            )
            rows.append(row)

        result = (
            supabase
            .table("signal_scans")
            .insert(rows)
            .execute()
        )

        inserted_rows = result.data or rows

        for row in inserted_rows:
            normalized = row_to_frontend(
                {
                    **row,
                    "scan_session": session_id,
                }
            )

            await publish_live(
                session_id,
                normalized,
            )

        return {
            "session_id": session_id,
            "ingested": len(rows),
            "status": "ok",
        }

    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={
                "error": str(error),
                "trace": traceback.format_exc(),
            },
        )


# ---------------------------------------------------------------------------
# New single-observation endpoint used by Mac/ESP32/SDR collectors
# ---------------------------------------------------------------------------

@router.post("/observation")
async def ingest_observation(
    observation: IncomingObservation,
):
    try:
        database_row = observation_to_database_row(
            observation
        )

        result = (
            supabase
            .table("signal_scans")
            .insert(database_row)
            .execute()
        )

        inserted_row = (
            result.data[0]
            if result.data
            else database_row
        )

        normalized = row_to_frontend(
            {
                **database_row,
                **inserted_row,
            }
        )

        await publish_live(
            observation.session_id,
            normalized,
        )

        return normalized

    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={
                "error": str(error),
                "trace": traceback.format_exc(),
            },
        )


# ---------------------------------------------------------------------------
# Read one session
# ---------------------------------------------------------------------------

@router.get("/session/{session_id}")
async def get_session(
    session_id: str,
    limit: int = Query(
        default=2500,
        ge=1,
        le=10_000,
    ),
):
    try:
        # Supabase commonly limits responses by default, so range()
        # explicitly requests the desired number of rows.
        result = (
            supabase
            .table("signal_scans")
            .select("*")
            .eq("scan_session", session_id)
            .order("created_at", desc=False)
            .range(0, limit - 1)
            .execute()
        )

        return [
            row_to_frontend(row)
            for row in (result.data or [])
        ]

    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={
                "error": str(error),
                "trace": traceback.format_exc(),
            },
        )


# ---------------------------------------------------------------------------
# List sessions
# ---------------------------------------------------------------------------

@router.get("/sessions")
async def list_sessions():
    try:
        result = (
            supabase
            .table("signal_scans")
            .select(
                "scan_session,signal_type,created_at"
            )
            .order("created_at", desc=True)
            .limit(1000)
            .execute()
        )

        sessions: dict[str, dict[str, Any]] = {}

        for row in result.data or []:
            session_id = row.get("scan_session")

            if not session_id:
                continue

            if session_id not in sessions:
                sessions[session_id] = {
                    "scan_session": session_id,
                    "count": 0,
                    "signal_types": set(),
                    "latest": row.get("created_at"),
                }

            session = sessions[session_id]
            session["count"] += 1
            session["signal_types"].add(
                normalize_signal_type(
                    row.get("signal_type")
                )
            )

        return [
            {
                "scan_session": value[
                    "scan_session"
                ],
                "count": value["count"],
                "signal_types": sorted(
                    value["signal_types"]
                ),
                "latest": value["latest"],
            }
            for value in sessions.values()
        ]

    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={
                "error": str(error),
                "trace": traceback.format_exc(),
            },
        )


# ---------------------------------------------------------------------------
# Server-Sent Events
# ---------------------------------------------------------------------------

async def live_event_generator(
    request: Request,
    session_id: str,
) -> AsyncGenerator[str, None]:
    queue: asyncio.Queue[dict[str, Any]] = (
        asyncio.Queue(maxsize=500)
    )

    subscribers[session_id].add(queue)

    try:
        # This is a named event. Your frontend ignores it because it only
        # listens to onmessage, which is intentional.
        yield (
            "event: connected\n"
            f"data: {json.dumps({'session_id': session_id})}\n\n"
        )

        while True:
            if await request.is_disconnected():
                break

            try:
                observation = await asyncio.wait_for(
                    queue.get(),
                    timeout=15,
                )

                payload = json.dumps(
                    observation,
                    separators=(",", ":"),
                    default=str,
                )

                # Events without an "event:" field are received through
                # EventSource.onmessage in your React component.
                yield f"data: {payload}\n\n"

            except asyncio.TimeoutError:
                yield ": keepalive\n\n"

    finally:
        subscribers[session_id].discard(queue)

        if not subscribers[session_id]:
            subscribers.pop(session_id, None)


@router.get("/live")
async def live_signals(
    request: Request,
    session_id: str = Query(
        ...,
        min_length=1,
    ),
):
    return StreamingResponse(
        live_event_generator(
            request,
            session_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Demo endpoint
# ---------------------------------------------------------------------------

@router.post("/demo")
async def create_demo_signals(
    request: DemoSignalRequest,
):
    samples = [
        IncomingObservation(
            session_id=request.session_id,
            signal_type="wifi",
            display_name="Demo Wi-Fi",
            protocol="802.11",
            frequency_hz=2_437_000_000,
            channel=6,
            rssi_dbm=-48,
            node_id=request.node_id,
            receiver_lat=request.receiver_lat,
            receiver_lon=request.receiver_lon,
            classification_confidence=0.99,
        ),
        IncomingObservation(
            session_id=request.session_id,
            signal_type="bluetooth",
            display_name="Demo BLE Device",
            protocol="Bluetooth LE",
            frequency_hz=2_402_000_000,
            rssi_dbm=-68,
            node_id=request.node_id,
            receiver_lat=request.receiver_lat,
            receiver_lon=request.receiver_lon,
            classification_confidence=0.95,
        ),
        IncomingObservation(
            session_id=request.session_id,
            signal_type="radio",
            display_name="Demo 433 MHz signal",
            modulation="OOK",
            frequency_hz=433_920_000,
            bandwidth_hz=25_000,
            rssi_dbm=-61,
            node_id=request.node_id,
            receiver_lat=request.receiver_lat,
            receiver_lon=request.receiver_lon,
            bearing_deg=72,
            bearing_uncertainty_deg=18,
            estimated_lat=(
                request.receiver_lat + 0.00025
            ),
            estimated_lon=(
                request.receiver_lon + 0.00030
            ),
            location_accuracy_m=40,
            classification_confidence=0.63,
        ),
    ]

    created: list[dict[str, Any]] = []

    try:
        for sample in samples:
            database_row = observation_to_database_row(
                sample
            )

            result = (
                supabase
                .table("signal_scans")
                .insert(database_row)
                .execute()
            )

            inserted_row = (
                result.data[0]
                if result.data
                else database_row
            )

            normalized = row_to_frontend(
                {
                    **database_row,
                    **inserted_row,
                }
            )

            created.append(normalized)

            await publish_live(
                request.session_id,
                normalized,
            )

        return {
            "status": "ok",
            "session_id": request.session_id,
            "created": len(created),
            "observations": created,
        }

    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={
                "error": str(error),
                "trace": traceback.format_exc(),
            },
        )
    