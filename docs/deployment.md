# Free-tier deployment: Cloudflare Pages + Oracle Cloud

This setup serves the React frontend from Cloudflare Pages and runs the authenticated FastAPI/YOLO backend on an Oracle Cloud Infrastructure (OCI) Ubuntu VM. The API, SQLite database, uploaded media, results, and model weights stay on the VM's persistent Docker volume. Caddy provides HTTPS for the API using a domain name you control.

## Cost and trade-offs

- Cloudflare Pages has a Free plan for static sites, subject to its current build and asset limits. This project does not use Pages Functions.
- OCI lists an Always Free allowance for Ampere A1 compute and block storage, but capacity is not guaranteed in every region and can be temporarily unavailable. The published monthly A1 allowance is equivalent to up to 2 OCPUs and 12 GB of memory for a full month; verify the current quota and eligibility in your tenancy before creating resources. Stay within the Always Free limits and do not add paid resources. Oracle may require a payment card for account verification.
- This is not a managed hosting service: you maintain Ubuntu, Docker, backups, firewall rules, updates, and recovery. A free VM is not a production availability guarantee.
- The app uses one shared login for everyone, and all users see the same job history and files. Do not use it for sensitive media or confidential data.
- The VM runs CPU inference. First startup downloads `yolov8n.pt`; later downloads and inference consume VM disk, RAM, CPU, and network. Keep uploads modest and back up important data separately.

Check the live [OCI Always Free resource list](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) and [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) before deployment. PyTorch publishes CPU wheels for Linux ARM64 in its [official wheel index](https://download.pytorch.org/whl/cpu/torch/); the first ARM64 image build still needs to complete successfully on your chosen VM image.

## 1. Deploy the frontend to Cloudflare Pages

1. Push this repository to GitHub and sign in to Cloudflare.
2. Open **Workers & Pages → Create → Pages → Connect to Git** and select the repository.
3. Configure the monorepo build:
   - Framework preset: **Vite**
   - Root directory: `frontend`
   - Build command: `npm ci && npm run build`
   - Build output directory: `dist`
4. Add the production environment variable `VITE_API_URL` with the HTTPS API URL you plan to use, including `/api`, for example `https://api.example.com/api`.
5. Deploy and record the production `https://<project>.pages.dev` URL. The `frontend/public/_redirects` file keeps client-side routes working on Pages.

If you use a custom frontend domain, set `FRONTEND_ORIGIN` to that exact origin (scheme and hostname only, no path or trailing slash). Preview deployment URLs are not automatically allowed by the API's CORS policy.

## 2. Create the OCI VM and DNS record

1. In OCI, create an **Always Free eligible** Ubuntu ARM VM using `VM.Standard.A1.Flex`. A 1 OCPU / 6 GB configuration is a reasonable starting point; the maximum free monthly allowance can support 2 OCPUs / 12 GB if the capacity and quota are available. A 50 GB boot volume is a practical starting size and counts toward your block-volume quota.
2. Provide your own SSH public key. Record the VM's public IPv4 address and connect over SSH.
3. In the VM's VCN security list or network security group, allow inbound TCP 80 and 443 from the internet. Allow TCP 22 only from your own public IP where practical. Do not expose port 8000. Use OCI's network rules as the perimeter firewall; Docker-published ports may bypass host UFW rules.
4. Create an A record for a hostname such as `api.example.com` pointing to the VM's public IPv4 address. Use a domain you own or a DNS provider that gives you a hostname. If using Cloudflare DNS, set this API record to **DNS only** so Caddy can issue its TLS certificate directly. If the VM's public IP changes, update the record.
5. Wait until the hostname resolves to that public IP before starting Caddy. Caddy will request and renew the API's TLS certificate automatically when DNS and ports 80/443 are reachable.

## 3. Install Docker and launch the API

Install Docker Engine and its Compose plugin using Docker's [official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Then clone the repository on the VM and enter it:

```bash
git clone <your-github-repository-url> ai-road-vision
cd ai-road-vision
sudo apt-get update
sudo apt-get install -y openssl
cp deploy/oracle/.env.example .env
openssl rand -hex 32
```

Edit `.env` and set:

- `API_DOMAIN` to the API DNS hostname from step 2.
- `FRONTEND_ORIGIN` to the exact Cloudflare Pages production URL, such as `https://ai-road-vision.pages.dev`.
- `ROADVISION_AUTH_USERNAME` to your chosen sign-in name.
- `ROADVISION_AUTH_PASSWORD` to a unique password with at least 12 characters. Do not reuse an important password.
- `ROADVISION_AUTH_SECRET` to the full output from `openssl rand -hex 32`.

Keep `.env` private; it is ignored by Git. Start the production stack:

```bash
sudo docker compose --env-file .env -f docker-compose.oracle.yml up -d --build
sudo docker compose --env-file .env -f docker-compose.oracle.yml ps
sudo docker compose --env-file .env -f docker-compose.oracle.yml logs -f caddy api
```

The first image build can take a while. The API downloads the configured default weights on its first inference if they are not already present. The model and application data persist in the `roadvision_data` volume across container recreation and VM reboot. Caddy's certificate and configuration data persist in their own volumes.

## 4. Verify and maintain

1. Open `https://<API_DOMAIN>/api/health`. A JSON response with `"status":"ok"` confirms the API is reachable; model readiness may initially be false until its first initialization/download.
2. Open the Cloudflare Pages URL, sign in, and run a small image detection.
3. Check `sudo docker compose --env-file .env -f docker-compose.oracle.yml logs --tail=100 api` if the API is unhealthy or inference fails.
4. After changing `VITE_API_URL` or frontend code, trigger a Pages redeploy. Vite embeds this variable at build time.
5. Back up the VM's `roadvision_data` volume and keep a copy off the VM. A VM deletion, account issue, or storage failure can still lose data.
6. Update the app with `git pull`, then run `sudo docker compose --env-file .env -f docker-compose.oracle.yml up -d --build`. Keep `.env` and the Docker volumes intact.

For usage details and licensing caveats, see the root [README](../README.md). Ultralytics' software and model licensing depends on use; review its [current license terms](https://www.ultralytics.com/license) before distributing or using the service commercially.
