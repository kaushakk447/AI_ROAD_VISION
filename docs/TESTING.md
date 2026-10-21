# Testing

Run backend tests from `backend`:

```powershell
pytest
```

Build the frontend from `frontend`:

```powershell
npm run build
```

The backend tests verify API health and model reporting, upload file signatures, SQLite persistence and aggregation, CSV formatting, and track summaries. One service test uses an explicitly mocked YOLO-like object only to assert that configured inference options reach the model call; it does not fabricate or validate detections. To verify real inference manually, install compatible Ultralytics/PyTorch packages, provide trusted model weights and a real image, and submit it through `POST /api/detect/image`. Check that the response includes the selected model, actual detections, class counts, and an annotated output. Report this separately from unit tests.
