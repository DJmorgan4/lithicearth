from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
import uuid
import os
from supabase import create_client

router = APIRouter(prefix="/api/signals", tags=["whisper"])

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_KEY"]
)

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

@router.post("/ingest")
async def ingest_signals(batch: ScanBatch):
    session_id = batch.scan_session or str(uuid.uuid4())
    rows = [{**r.dict(), "scan_session": session_id} for r in batch.readings]
    supabase.table("signal_scans").insert(rows).execute()
    return {"session_id": session_id, "ingested": len(rows), "status": "ok"}

@router.get("/session/{session_id}")
async def get_session(session_id: str):
    result = supabase.table("signal_scans")\
        .select("*")\
        .eq("scan_session", session_id)\
        .execute()
    return result.data

@router.get("/sessions")
async def list_sessions():
    result = supabase.table("signal_scans")\
        .select("scan_session, signal_type, created_at")\
        .order("created_at", desc=True)\
        .limit(100)\
        .execute()
    # Group by session
    sessions = {}
    for row in result.data:
        sid = row["scan_session"]
        if sid not in sessions:
            sessions[sid] = {"scan_session": sid, "count": 0, 
                           "types": set(), "latest": row["created_at"]}
        sessions[sid]["count"] += 1
        sessions[sid]["types"].add(row["signal_type"])
    return [{"scan_session": v["scan_session"], "count": v["count"],
             "signal_types": list(v["types"]), "latest": v["latest"]}
            for v in sessions.values()]
