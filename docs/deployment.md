# Deploy AI Road Vision

This project deploys as a static React site on Vercel and a Dockerized FastAPI service on Railway. The API handles uploads, YOLO inference, SQLite, and generated files; those workloads do not pass through Vercel Functions.

## 1. Push the project to GitHub

This workspace is not currently connected to a Git repository. Create an empty GitHub repository, then run these commands from the project folder in PowerShell:

```powershell
git init
git add .
git commit -m "Prepare AI Road Vision deployment"
git branch -M main
git remote add origin https://github.com/<your-account>/<repository>.git
git push -u origin main
```

The repository's `.gitignore` excludes local environments, model weights, uploads, generated results, and `.env` secrets. Do not force-add those files.

## 2. Create the Railway backend

1. Create a Railway project from the GitHub repository and add a service for it.
2. In the service settings, set **Root Directory** to `/backend`. Railway will build the included Dockerfile.
3. Add a persistent volume and mount it at `/app/data`. This stores SQLite, uploaded files, annotated results, and downloaded model weights across deploys.
4. Add these variables before exposing a public domain:

   | Variable | Value |
   | --- | --- |
   | `ROADVISION_AUTH_REQUIRED` | `true` |
   | `ROADVISION_AUTH_USERNAME` | A username you choose |
   | `ROADVISION_AUTH_PASSWORD` | A unique password of at least 12 characters |
   | `ROADVISION_AUTH_SECRET` | A random secret of at least 32 bytes; generate one below |
   | `ROADVISION_DATA_DIR` | `/app/data` |
   | `ROADVISION_MODEL_DIR` | `/app/data/models` |
   | `ROADVISION_MODEL_PATH` | `yolov8n.pt` |
   | `ROADVISION_DEVICE` | `cpu` |
   | `ROADVISION_IMAGE_SIZE` | `640` |
   | `ROADVISION_VIDEO_IMAGE_SIZE` | `640` |
   | `ROADVISION_MAX_UPLOAD_MB` | `50` |
   | `ROADVISION_VIDEO_WORKERS` | `1` |
   | `ROADVISION_RETENTION_DAYS` | `30` |
   | `ROADVISION_CORS_ORIGINS` | `https://<your-vercel-domain>` |

   Generate the secret locally in PowerShell and paste the output into Railway's variable editor:

   ```powershell
   $bytes = New-Object byte[] 32
   $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
   $rng.GetBytes($bytes)
   [BitConverter]::ToString($bytes).Replace('-', '').ToLower()
   $rng.Dispose()
   ```

5. Deploy, then generate a Railway domain for the backend. Its API base URL is `https://<your-railway-domain>/api`.

Railway supplies `PORT`; the Docker start command uses it automatically. The backend has a single shared login, not per-user accounts. Anyone with that login can see the same detection history and stored files.

## 3. Deploy the frontend to Vercel

1. Import the same GitHub repository into Vercel.
2. Set **Root Directory** to `frontend`.
3. Set the build command to `npm run build` and the output directory to `dist`.
4. Add the environment variable `VITE_API_URL` with value `https://<your-railway-domain>/api`.
5. Deploy and copy the assigned Vercel domain.
6. In Railway, set `ROADVISION_CORS_ORIGINS` to that exact origin, with no trailing slash, then redeploy/restart the backend.

The `frontend/vercel.json` rewrite serves the React app for direct navigation to routes such as `/images` and `/history`.

## 4. Verify the deployment

1. Open `https://<your-railway-domain>/api/health`; it should return a healthy status.
2. Open the Vercel URL and sign in with the Railway username and password.
3. Run a small image detection. The first run downloads `yolov8n.pt` into the mounted volume and may take longer.
4. Confirm the annotated image and CSV download work, then test a short video.
5. Review Railway usage and the persistent volume periodically. Use **Settings → Clean expired files** to remove old jobs and outputs.

Keep the volume attached: deleting it permanently removes the database, uploaded media, results, and cached weights. Never put passwords or signing secrets in Vercel's `VITE_*` variables; those are public frontend build values.

## Cost and sizing

Railway's Free plan is limited to 0.5 GB RAM and a 0.5 GB volume. That is too tight for a practical PyTorch/Ultralytics backend with persisted data. Railway Hobby is currently $5/month and includes $5 of monthly usage; usage beyond the included amount is billed separately. Its volume limit is 5 GB. Check current limits and usage before deploying, especially for video workloads: [Railway plans and pricing](https://docs.railway.com/pricing/plans).

Vercel is used only for static files. The app uploads directly to Railway, avoiding Vercel Function's 4.5 MB request/response body cap: [Vercel Function limits](https://vercel.com/docs/functions/limitations).
