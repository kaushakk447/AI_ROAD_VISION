import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app import config


def _connect() -> sqlite3.Connection:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(config.DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def initialize() -> None:
    with _connect() as connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                filename TEXT NOT NULL,
                input_name TEXT NOT NULL,
                result_name TEXT,
                status TEXT NOT NULL,
                model TEXT NOT NULL,
                confidence REAL NOT NULL,
                tracking INTEGER NOT NULL DEFAULT 0,
                frame_interval INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                progress REAL NOT NULL DEFAULT 0,
                processing_time_seconds REAL,
                processing_fps REAL,
                duration_seconds REAL,
                total_frames INTEGER,
                processed_frames INTEGER NOT NULL DEFAULT 0,
                detections_count INTEGER NOT NULL DEFAULT 0,
                unique_tracks INTEGER NOT NULL DEFAULT 0,
                class_counts TEXT NOT NULL DEFAULT '{}',
                error TEXT
            );
            CREATE TABLE IF NOT EXISTS detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                frame_index INTEGER,
                timestamp_seconds REAL,
                class_id INTEGER NOT NULL,
                class_name TEXT NOT NULL,
                confidence REAL NOT NULL,
                x1 REAL NOT NULL,
                y1 REAL NOT NULL,
                x2 REAL NOT NULL,
                y2 REAL NOT NULL,
                track_id INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
            CREATE INDEX IF NOT EXISTS idx_detections_job ON detections(job_id);
            CREATE INDEX IF NOT EXISTS idx_detections_category ON detections(class_name);
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        connection.execute(
            "UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE status = 'processing'",
            ("Processing was interrupted when the server stopped.", _now()),
        )


def create_job(job: dict[str, Any]) -> None:
    now = _now()
    fields = (
        "id", "kind", "filename", "input_name", "result_name", "status", "model",
        "confidence", "tracking", "frame_interval", "created_at", "updated_at",
    )
    values = [job.get(field) for field in fields]
    values[10] = now
    values[11] = now
    with _connect() as connection:
        connection.execute(
            f"INSERT INTO jobs ({', '.join(fields)}) VALUES ({', '.join('?' for _ in fields)})",
            values,
        )


def update_job(job_id: str, **updates: Any) -> None:
    allowed = {
        "status", "result_name", "progress", "processing_time_seconds", "processing_fps",
        "duration_seconds", "total_frames", "processed_frames", "detections_count",
        "unique_tracks", "class_counts", "error",
    }
    changes = {key: value for key, value in updates.items() if key in allowed}
    if "class_counts" in changes:
        changes["class_counts"] = json.dumps(changes["class_counts"], sort_keys=True)
    changes["updated_at"] = _now()
    assignments = ", ".join(f"{key} = ?" for key in changes)
    with _connect() as connection:
        connection.execute(
            f"UPDATE jobs SET {assignments} WHERE id = ?",
            [*changes.values(), job_id],
        )


def add_detections(job_id: str, detections: list[dict[str, Any]]) -> None:
    if not detections:
        return
    rows = [
        (
            job_id,
            item.get("frame_index"),
            item.get("timestamp_seconds"),
            item["class_id"],
            item["class_name"],
            item["confidence"],
            item["bbox"]["x1"],
            item["bbox"]["y1"],
            item["bbox"]["x2"],
            item["bbox"]["y2"],
            item.get("track_id"),
        )
        for item in detections
    ]
    with _connect() as connection:
        connection.executemany(
            """INSERT INTO detections (
                job_id, frame_index, timestamp_seconds, class_id, class_name, confidence,
                x1, y1, x2, y2, track_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )


def _job_dict(row: sqlite3.Row) -> dict[str, Any]:
    job = dict(row)
    job["tracking"] = bool(job["tracking"])
    job["class_counts"] = json.loads(job["class_counts"] or "{}")
    if job["status"] == "failed" and job["error"]:
        job["error"] = (
            "Image processing failed. Check the image and model configuration."
            if job["kind"] == "image"
            else "Video processing failed. Check the file, codec, and model configuration."
        )
    job["annotated_result_url"] = (
        f"/api/jobs/{job['id']}/download" if job["status"] == "completed" and job["result_name"] else None
    )
    job["report_url"] = f"/api/jobs/{job['id']}/report.csv" if job["status"] == "completed" else None
    return job


def get_job(job_id: str) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return _job_dict(row) if row else None


def list_jobs(limit: int = 50, offset: int = 0, kind: str | None = None) -> list[dict[str, Any]]:
    query = "SELECT * FROM jobs"
    parameters: list[Any] = []
    if kind:
        query += " WHERE kind = ?"
        parameters.append(kind)
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    parameters.extend((limit, offset))
    with _connect() as connection:
        rows = connection.execute(query, parameters).fetchall()
    return [_job_dict(row) for row in rows]


def list_detections(
    job_id: str,
    limit: int = 1000,
    offset: int = 0,
    category: str | None = None,
) -> list[dict[str, Any]]:
    query = "SELECT * FROM detections WHERE job_id = ?"
    parameters: list[Any] = [job_id]
    if category:
        query += " AND class_name = ?"
        parameters.append(category)
    query += " ORDER BY COALESCE(frame_index, 0), id LIMIT ? OFFSET ?"
    parameters.extend((limit, offset))
    with _connect() as connection:
        rows = connection.execute(query, parameters).fetchall()
    return [
        {
            "class_id": row["class_id"],
            "class_name": row["class_name"],
            "confidence": row["confidence"],
            "bbox": {key: row[key] for key in ("x1", "y1", "x2", "y2")},
            "track_id": row["track_id"],
            "frame_index": row["frame_index"],
            "timestamp_seconds": row["timestamp_seconds"],
        }
        for row in rows
    ]


def list_tracks(job_id: str) -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            """SELECT track_id, class_name, frame_index, timestamp_seconds, x1, y1, x2, y2
               FROM detections WHERE job_id = ? AND track_id IS NOT NULL
               ORDER BY track_id, frame_index, id""",
            (job_id,),
        ).fetchall()
    tracks: dict[int, dict[str, Any]] = {}
    for row in rows:
        track_id = int(row["track_id"])
        track = tracks.setdefault(
            track_id,
            {
                "track_id": track_id,
                "class_name": row["class_name"],
                "observations": 0,
                "first_frame": row["frame_index"],
                "last_frame": row["frame_index"],
                "start_time_seconds": row["timestamp_seconds"],
                "end_time_seconds": row["timestamp_seconds"],
                "trajectory": [],
            },
        )
        track["observations"] += 1
        track["last_frame"] = row["frame_index"]
        track["end_time_seconds"] = row["timestamp_seconds"]
        track["trajectory"].append(
            {
                "frame_index": row["frame_index"],
                "timestamp_seconds": row["timestamp_seconds"],
                "center_x": (row["x1"] + row["x2"]) / 2,
                "center_y": (row["y1"] + row["y2"]) / 2,
            }
        )
    return list(tracks.values())


def analytics(job_id: str | None = None, category: str | None = None) -> dict[str, Any]:
    conditions = ["j.status = 'completed'"]
    parameters: list[Any] = []
    if job_id:
        conditions.append("j.id = ?")
        parameters.append(job_id)
    if category:
        conditions.append("d.class_name = ?")
        parameters.append(category)
    where = " AND ".join(conditions)
    with _connect() as connection:
        totals = connection.execute(
            f"""SELECT COUNT(DISTINCT j.id) AS completed_jobs,
                       COUNT(d.id) AS total_detections,
                       COUNT(DISTINCT CASE WHEN d.class_name IN ('person', 'pedestrian') THEN d.id END) AS pedestrians,
                       COUNT(DISTINCT CASE WHEN d.class_name IN (
                           'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train'
                       ) THEN d.id END) AS vehicles,
                       AVG(j.processing_time_seconds) AS average_processing_time,
                       AVG(j.processing_fps) AS average_processing_fps
                FROM jobs j LEFT JOIN detections d ON d.job_id = j.id
                WHERE {where}""",
            parameters,
        ).fetchone()
        categories = connection.execute(
            f"""SELECT d.class_name AS name, COUNT(d.id) AS count
                FROM jobs j JOIN detections d ON d.job_id = j.id
                WHERE {where} GROUP BY d.class_name ORDER BY count DESC, name""",
            parameters,
        ).fetchall()
        trend = connection.execute(
            f"""SELECT substr(j.created_at, 1, 10) AS date, COUNT(d.id) AS detections
                FROM jobs j LEFT JOIN detections d ON d.job_id = j.id
                WHERE {where} GROUP BY date ORDER BY date""",
            parameters,
        ).fetchall()
        recent = connection.execute(
            "SELECT * FROM jobs ORDER BY created_at DESC LIMIT 8"
        ).fetchall()
        total_jobs = connection.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    return {
        "total_jobs": total_jobs,
        "completed_jobs": totals["completed_jobs"] or 0,
        "total_detections": totals["total_detections"] or 0,
        "pedestrians": totals["pedestrians"] or 0,
        "vehicles": totals["vehicles"] or 0,
        "average_processing_time_seconds": totals["average_processing_time"],
        "average_processing_fps": totals["average_processing_fps"],
        "category_counts": [dict(row) for row in categories],
        "detections_over_time": [dict(row) for row in trend],
        "recent_jobs": [_job_dict(row) for row in recent],
    }


def delete_job(job_id: str) -> None:
    with _connect() as connection:
        connection.execute("DELETE FROM jobs WHERE id = ?", (job_id,))


def delete_jobs_before(cutoff: str) -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT * FROM jobs WHERE created_at < ? AND status IN ('completed', 'failed')",
            (cutoff,),
        ).fetchall()
        connection.executemany("DELETE FROM jobs WHERE id = ?", [(row["id"],) for row in rows])
    return [_job_dict(row) for row in rows]


def read_settings() -> dict[str, Any]:
    with _connect() as connection:
        rows = connection.execute("SELECT key, value FROM settings").fetchall()
    saved = {row["key"]: row["value"] for row in rows}
    return {
        "confidence_threshold": float(saved.get("confidence_threshold", "0.35")),
        "max_upload_mb": int(saved.get("max_upload_mb", str(config.MAX_UPLOAD_MB))),
        "retention_days": config.RETENTION_DAYS,
    }


def update_settings(values: dict[str, Any]) -> dict[str, Any]:
    with _connect() as connection:
        for key, value in values.items():
            connection.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, str(value)),
            )
    return read_settings()


def csv_rows(job_id: str, category: str | None = None) -> tuple[list[str], list[dict[str, Any]]]:
    rows = list_detections(job_id, limit=1_000_000, offset=0, category=category)
    return (
        ["frame_index", "timestamp_seconds", "class_id", "class_name", "confidence", "x1", "y1", "x2", "y2", "track_id"],
        rows,
    )
