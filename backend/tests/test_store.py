from app.database import store


def _create_video_job(database, job_id="video-job"):
    database.create_job(
        {
            "id": job_id,
            "kind": "video",
            "filename": "road.mp4",
            "input_name": "safe-input.mp4",
            "result_name": None,
            "status": "processing",
            "model": "yolov8n.pt",
            "confidence": 0.35,
            "tracking": True,
            "frame_interval": 2,
        }
    )


def test_job_analytics_and_tracks_are_derived_from_stored_detections(isolated_store):
    _create_video_job(isolated_store)
    isolated_store.add_detections(
        "video-job",
        [
            {
                "class_id": 2,
                "class_name": "car",
                "confidence": 0.92,
                "bbox": {"x1": 10, "y1": 20, "x2": 30, "y2": 40},
                "track_id": 7,
                "frame_index": 0,
                "timestamp_seconds": 0,
            },
            {
                "class_id": 2,
                "class_name": "car",
                "confidence": 0.9,
                "bbox": {"x1": 14, "y1": 22, "x2": 34, "y2": 42},
                "track_id": 7,
                "frame_index": 2,
                "timestamp_seconds": 0.08,
            },
        ],
    )
    isolated_store.update_job(
        "video-job",
        status="completed",
        result_name="result.mp4",
        detections_count=2,
        class_counts={"car": 2},
        processing_time_seconds=1.5,
        processing_fps=2 / 1.5,
        unique_tracks=1,
        progress=100,
    )

    summary = isolated_store.analytics()
    tracks = isolated_store.list_tracks("video-job")

    assert summary["completed_jobs"] == 1
    assert summary["vehicles"] == 2
    assert summary["total_detections"] == 2
    assert summary["category_counts"] == [{"name": "car", "count": 2}]
    assert tracks[0]["track_id"] == 7
    assert tracks[0]["observations"] == 2
    assert tracks[0]["first_frame"] == 0
    assert tracks[0]["last_frame"] == 2
    assert tracks[0]["trajectory"][1]["center_x"] == 24


def test_csv_rows_include_frame_and_track_fields(isolated_store):
    _create_video_job(isolated_store)
    isolated_store.add_detections(
        "video-job",
        [
            {
                "class_id": 0,
                "class_name": "person",
                "confidence": 0.8,
                "bbox": {"x1": 1, "y1": 2, "x2": 5, "y2": 10},
                "track_id": 3,
                "frame_index": 12,
                "timestamp_seconds": 0.4,
            }
        ],
    )

    headers, rows = isolated_store.csv_rows("video-job")

    assert "frame_index" in headers
    assert "track_id" in headers
    assert rows[0]["frame_index"] == 12
    assert rows[0]["track_id"] == 3


def test_deleting_job_cascades_detection_rows(isolated_store):
    _create_video_job(isolated_store)
    isolated_store.add_detections(
        "video-job",
        [
            {
                "class_id": 2,
                "class_name": "car",
                "confidence": 0.9,
                "bbox": {"x1": 1, "y1": 2, "x2": 5, "y2": 10},
                "track_id": 1,
                "frame_index": 0,
                "timestamp_seconds": 0,
            }
        ],
    )

    isolated_store.delete_job("video-job")

    assert isolated_store.get_job("video-job") is None
    assert isolated_store.list_detections("video-job") == []


def test_failed_job_errors_do_not_expose_internal_paths(isolated_store):
    _create_video_job(isolated_store)
    isolated_store.update_job(
        "video-job",
        status="failed",
        error="OpenCV error in C:\\private\\road.mp4",
    )

    job = isolated_store.get_job("video-job")

    assert job["error"] == "Video processing failed. Check the file, codec, and model configuration."
    assert "C:\\private" not in job["error"]
