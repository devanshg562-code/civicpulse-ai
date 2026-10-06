# CivicPulse AI

CivicPulse AI is a React/TypeScript civic-grievance client with a FastAPI REST backend designed to persist data in PostgreSQL. The React client never connects directly to PostgreSQL. There is no database fallback: when PostgreSQL is not configured, database-backed routes report that setup is required instead of presenting generated complaint records.

## Architecture

```text
React + Vite (localhost:5173)
        -> Axios REST calls
FastAPI (localhost:8000)
        -> SQLAlchemy / Alembic
PostgreSQL (DATABASE_URL, backend only)
        -> local text classification, duplicate scoring, analytics and risk estimates
```

The repository still contains the former Express/SQLite prototype in `server/`; the PostgreSQL implementation is in `backend/`. Start the new application with the commands in this README. Do not start the legacy Express server for the PostgreSQL workflow. `render.yaml` defines a Render deployment with a hosted PostgreSQL database, FastAPI API, and static frontend.

## Supabase setup

1. Create an account at Supabase and create a new project. Save the database password securely; it cannot be recovered from this repository.
2. In Supabase, open **Project Settings → Database → Connection string**. Copy the URI. Use the direct connection if available; if your network requires the pooler, select the session pooler and use its supplied URI/port.
3. Copy `backend/.env.example` to `backend/.env`.
4. Set `DATABASE_URL` to the URI from Supabase. Keep TLS enabled (`sslmode=require`). Do not put this in any frontend `VITE_*` variable.
5. Generate a long random JWT secret:

   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

   Put it in `JWT_SECRET` in `backend/.env`. Do not commit or share the file.
6. Install requirements and apply migrations:

   ```powershell
   cd backend
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   alembic upgrade head
   ```

7. Verify `roles`, `users`, `departments`, `complaint_categories`, `complaints`, `complaint_locations`, `complaint_attachments`, `complaint_status_history`, `complaint_clusters`, `cluster_members`, `predictive_alerts`, `notifications`, `feedback`, `audit_logs`, `ai_analysis_results`, `complaint_counters`, and `revoked_tokens` in the Supabase Table Editor. The initial migration creates no demo users or complaints.
8. Set `FRONTEND_URL=http://localhost:5173` in `backend/.env`.
9. Start FastAPI:

   ```powershell
   python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

10. Open another terminal and start React:

    ```powershell
    cd client
    copy .env.example .env
    npm install
    npm run dev
    ```

11. Visit `http://localhost:5173`, register a citizen account, and submit a report. API docs are at `http://localhost:8000/docs` and `http://localhost:8000/redoc`.

## Deploy to Render

The root `render.yaml` is a Render Blueprint for the FastAPI API, React static site, and PostgreSQL database. To deploy:

1. Push this repository to GitHub without committing `.env` files, local databases, or uploads.
2. Sign in to Render, choose **New → Blueprint**, connect the GitHub repository, and apply the Blueprint.
3. Wait for the database, API, and frontend services to finish provisioning. The API applies Alembic migrations at startup and exposes health at `/api/health`; the frontend is configured to call the API.
4. Confirm `https://civicpulse-ai-api.onrender.com/api/health` reports a connected database, then open `https://civicpulse-ai-web.onrender.com`.

The Blueprint uses free plans. Review Render's current limits before relying on it: free services may sleep and free database availability, retention, and backups are limited. Uploaded files use temporary storage in this configuration and are not durable. For production, use an appropriately sized persistent PostgreSQL plan and durable private object storage. The local database and its records are not uploaded or copied by deployment; the hosted database starts independently, with no seeded admin account.

## Environment variables

`backend/.env` (copy `backend/.env.example`) for local development:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; backend only |
| `JWT_SECRET` | JWT signing secret |
| `JWT_ALGORITHM` | JWT algorithm; default `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime |
| `FRONTEND_URL` | Browser origin allowed by CORS |
| `UPLOAD_DIR` | Server-side attachment directory |
| `MAX_UPLOAD_BYTES` | Attachment limit; default 5 MiB |

`client/.env` (copy `client/.env.example`) contains only `VITE_API_BASE_URL`, default `http://localhost:8000/api`. Never put database credentials or backend secrets in a frontend variable.

## API overview

See the [complete API reference](./docs/API.md) for endpoint details, OAuth2 login fields, payloads, examples, permissions, and error responses. Runtime docs are at `http://localhost:8000/docs`, `http://localhost:8000/redoc`, and `http://localhost:8000/openapi.json`.

Private endpoints use `Authorization: Bearer <JWT>`.

| Area | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Citizen | `POST /api/complaints`, `GET /api/complaints/my`, `GET /api/complaints/{id}`, `GET /api/complaints/{id}/timeline`, `POST /api/complaints/{id}/feedback`, `GET /api/notifications`, `PUT /api/notifications/{id}/read` |
| Officer | `GET /api/officer/complaints`, `GET /api/officer/complaints/{id}`, `PUT /api/officer/complaints/{id}/status`, `POST /api/officer/complaints/{id}/resolve`, `GET /api/officer/clusters`, `GET /api/officer/predictions` |
| Admin | `GET /api/admin/dashboard`, `/users`, `/officers`, `/complaints`, `/departments`, `/clusters`, `/hotspots`, `/predictions`, `/analytics`, `/audit-logs`, and `POST /api/admin/alerts` |

Validation errors return 422, unauthenticated requests 401, permission denials 403, missing records 404, and missing/unavailable database configuration 503. FastAPI does not expose internal stack traces in its database error response.

## Real-world verification flow

1. Register a citizen, then log in.
2. Submit “Large pothole near school” with a detailed description and choose map coordinates by clicking the report map (manual coordinates are supported).
3. Confirm the response returns an automatically generated `CP-YYYY-000001` complaint number and AI analysis. Refresh and log out/in; verify the record persists.
4. Provision an officer account in PostgreSQL through a trusted admin procedure; log in as that officer and view the unassigned complaint.
5. Update the status to In Progress and then Resolved.
6. Log in as the citizen again; verify the timeline/status and submit feedback.
7. Log in as a trusted admin account; verify database-derived totals, category analytics, location markers, notifications and audit logs.

Optional demonstration seeds require explicit opt-in:

```powershell
$env:ENABLE_DEMO_SEED = "true"
python scripts/seed_data.py
```

Run from `backend/`. The script refuses to run without the configured PostgreSQL database and does not create seed data by default. Never use its known demo accounts in production.

Create a non-demo officer or admin account interactively (from `backend/`) with:

```powershell
python scripts/provision_user.py
```

This prompts for name, email, role and password; it never hardcodes or prints the password.

## Testing

```powershell
cd backend
pytest
alembic upgrade head
```

Frontend:

```powershell
cd client
npm run build
```

Backend smoke tests check health reporting and auth gating without requiring Supabase. Persistent registration and complaint-flow tests require a disposable PostgreSQL database with migrations applied.

## AI and limitations

Classification uses a local TF-IDF/logistic-regression model trained on labeled database records when enough records are available, and a local keyword/rule fallback otherwise. Duplicate likelihood is a text/category/area heuristic; complaints are never automatically deleted. Area risk estimates consider actual complaint volume, recency, unresolved count, severity and resolution rate, are labeled **AI-estimated risk**, and are not guaranteed forecasts. No paid AI service is required.

## Security and production deployment

- Passwords use Argon2 hashes; database URLs and JWT secrets remain on the backend.
- Citizens can access only their records; officers can view assigned or unassigned work; admin routes require ADMIN role.
- Public registration creates citizens only. Provision officer/admin roles through a trusted administrative process.
- Uploads are limited to JPEG, PNG, and PDF and assigned generated server-side filenames. Before public deployment add signature inspection, malware scanning, private object storage, and least-privilege file access.
- Deploy over HTTPS, rotate credentials, restrict CORS to the deployed frontend, use a least-privilege PostgreSQL account, enable backups, and avoid logging credentials or sensitive complaint text.

## Current setup requirement

For local development, set `DATABASE_URL` and `JWT_SECRET` in the ignored `backend/.env` and apply the Alembic migration. For Render, configure and deploy the Blueprint above; deployment creates a separate hosted database and does not use this machine's local database.
