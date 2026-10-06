# CivicPulse AI API reference

This document describes the FastAPI backend currently implemented in `backend/app/main.py`. The generated OpenAPI schema served by the running app is authoritative if an implementation detail changes.

## API explorer and base URL

| Environment | Base URL |
| --- | --- |
| Local development | `http://localhost:8000` |

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`
- Health: `GET /api/health`

Paths below include `/api`. Unless stated otherwise, request and response bodies are JSON and IDs are UUID strings. Timestamps are ISO 8601 strings, generally UTC.

## Authentication and roles

Protected endpoints require:

```http
Authorization: Bearer <access_token>
```

Obtain a token with `POST /api/auth/login`. This is an OAuth2 password flow and accepts `application/x-www-form-urlencoded` (not JSON):

| Form field | Value |
| --- | --- |
| `username` | Account email address |
| `password` | Account password |
| `scope` | Optional; leave empty |
| `client_id` | Optional; leave empty |
| `client_secret` | Optional; leave empty |

The response contains `access_token` and the compatibility field `token`, both with the same JWT, plus `token_type: "bearer"` and the authenticated user. Paste the access token into Swagger UI's **Authorize** dialog; do not include the `Bearer ` prefix in that dialog.

Roles:

- **Public**: no token needed.
- **Citizen**: a normal registered citizen account.
- **Officer**: provisioned by an administrator using `backend/scripts/provision_user.py`.
- **Admin**: provisioned by a trusted administrator; never selectable through public registration.
- **Authenticated**: any valid citizen, officer, or admin token.

Citizens can read only their own complaints. Officers can read unassigned complaints and their own assigned complaints, but not work assigned to another officer. Admin-only endpoints require the `ADMIN` role.

Registration and login require a configured database. Token creation additionally requires `JWT_SECRET`. The current health endpoint exposes whether each is ready; see [Health](#health).

## Common response and error format

Successful JSON responses are endpoint-specific. Errors generally use:

```json
{
  "detail": "Human-readable error"
}
```

Validation errors (`422`) use FastAPI's structured detail array. Common status codes:

| Status | Meaning |
| --- | --- |
| `400` | Invalid request or CORS origin rejected |
| `401` | Missing/invalid/expired token or invalid login credentials |
| `403` | Authenticated role cannot perform the operation |
| `404` | Resource not found or intentionally hidden by ownership checks |
| `409` | Duplicate email or operation conflicts with current state |
| `413` | Attachment exceeds the configured byte limit |
| `415` | Attachment MIME type is unsupported |
| `422` | Invalid fields, UUID, enum, or request shape |
| `429` | Login rate limit exceeded (10 attempts per client IP in a rolling minute) |
| `503` | Database/auth configuration missing, database unavailable, or migrations not applied |

SQLAlchemy database errors are returned as `503` with a general message; database stack traces are not returned to API clients.

## Endpoint index

| Area | Method and path | Access |
| --- | --- | --- |
| Health | `GET /api/health` | Public |
| Auth | `POST /api/auth/register` | Public |
| Auth | `POST /api/auth/login` | Public |
| Auth | `POST /api/auth/logout` | Authenticated |
| Auth | `GET /api/auth/me` | Authenticated |
| Complaints | `POST /api/complaints` | Citizen |
| Complaints | `GET /api/complaints/my` | Citizen |
| Complaints | `GET /api/complaints` | Authenticated; scoped by role |
| Complaints | `GET /api/complaints/{complaint_id}` | Authenticated; owner/assignment scoped |
| Complaints | `GET /api/complaints/{complaint_id}/timeline` | Authenticated; owner/assignment scoped |
| Complaints | `POST /api/complaints/{complaint_id}/feedback` | Citizen owner, resolved complaint |
| Attachments | `POST /api/complaints/{complaint_id}/attachments` | Authenticated; owner/assignment scoped |
| Notifications | `GET /api/notifications` | Authenticated |
| Notifications | `PUT /api/notifications/{notification_id}/read` | Notification owner |
| Officer | `GET /api/officer/complaints` | Officer or admin |
| Officer | `GET /api/officer/complaints/{complaint_id}` | Officer or admin; assignment scoped |
| Officer | `PUT /api/officer/complaints/{complaint_id}/status` | Officer or admin; assignment scoped |
| Officer | `PUT /api/officer/complaints/{complaint_id}/assign` | Admin |
| Officer | `POST /api/officer/complaints/{complaint_id}/resolve` | Officer or admin; assignment scoped |
| Officer | `GET /api/officer/clusters` | Officer or admin |
| Analytics | `GET /api/analytics/overview` | Authenticated; citizen data is scoped |
| Predictions | `GET /api/predictions` | Authenticated; citizen data is scoped |
| Predictions | `GET /api/officer/predictions` | Authenticated; same handler as `/api/predictions` |
| Clusters | `GET /api/clusters` | Officer or admin |
| Hotspots | `GET /api/hotspots` | Officer or admin |
| Alerts | `GET /api/alerts` | Authenticated; active public alerts |
| Admin | `GET /api/admin/dashboard` | Admin |
| Admin | `GET /api/admin/users`, `GET /api/users` | Admin; alias provided |
| Admin | `GET /api/admin/officers` | Admin |
| Admin | `GET /api/admin/complaints` | Admin |
| Admin | `GET /api/admin/complaints/{complaint_id}` | Admin |
| Admin | `GET /api/admin/departments`, `GET /api/departments` | Admin; alias provided |
| Admin | `GET /api/admin/clusters` | Admin |
| Admin | `GET /api/admin/hotspots` | Admin |
| Admin | `GET /api/admin/predictions` | Admin |
| Admin | `GET /api/admin/analytics` | Admin |
| Admin | `POST /api/admin/alerts` | Admin |
| Admin | `GET /api/admin/alerts` | Admin |
| Admin | `GET /api/admin/audit-logs` | Admin |

## Health

### `GET /api/health`

No authentication. Checks API readiness and attempts a database `SELECT 1`.

```json
{
  "api": "healthy",
  "database": "connected",
  "authentication": "configured",
  "ai": "ready"
}
```

`database` is `connected`, `disconnected`, or `not_configured`; `authentication` is `configured` or `not_configured`. A healthy API response does not imply that the database is ready.

## Authentication

### `POST /api/auth/register`

Creates a citizen account and signs the user in immediately. Public signup cannot assign officer/admin roles.

Request:

```json
{
  "name": "Asha Citizen",
  "email": "asha@example.org",
  "password": "a-long-password",
  "phone": "+1 555 0100"
}
```

`name`: 2–160 characters; `email`: 5–320 characters and must be a valid email; `password`: 10–128 characters; `phone`: optional, up to 40 characters.

Success: `201 Created`.

```json
{
  "token": "<jwt>",
  "token_type": "bearer",
  "user": {
    "id": "<uuid>",
    "name": "Asha Citizen",
    "email": "asha@example.org",
    "phone": "+1 555 0100",
    "role": "citizen",
    "is_active": true,
    "created_at": "<iso-8601>"
  }
}
```

Errors include `409` for an existing email and `503` if the database, migration roles, or JWT configuration are unavailable.

### `POST /api/auth/login`

Content type: `application/x-www-form-urlencoded`.

```text
username=asha%40example.org&password=a-long-password
```

Use the email address as `username`. Authentication is rate-limited to 10 attempts per client IP per minute.

Success:

```json
{
  "access_token": "<jwt>",
  "token": "<same-jwt>",
  "token_type": "bearer",
  "user": {
    "id": "<uuid>",
    "name": "Asha Citizen",
    "email": "asha@example.org",
    "phone": null,
    "role": "citizen",
    "is_active": true,
    "created_at": "<iso-8601>"
  }
}
```

Errors: `401` invalid email/password or inactive account, `429` rate limit, `503` database or JWT setup missing.

### `POST /api/auth/logout`

Requires bearer token. Revokes its JWT ID until expiration.

```json
{"message": "Logged out."}
```

### `GET /api/auth/me`

Requires bearer token.

```json
{"user": {"id": "<uuid>", "name": "Asha Citizen", "email": "asha@example.org", "phone": null, "role": "citizen", "is_active": true, "created_at": "<iso-8601>"}}
```

## Complaints and citizen workflow

### `POST /api/complaints`

Citizen only. Classifies the complaint, calculates duplicate likelihood, stores location/timeline/analysis records, creates notifications, and returns the generated complaint number.

Request:

```json
{
  "title": "Large pothole near school",
  "description": "A deep pothole is blocking the eastbound lane next to the school entrance.",
  "category": "Roads",
  "location": "Ward 4",
  "ward": "Ward 4",
  "address": "12 Main Street",
  "latitude": 40.7128,
  "longitude": -74.006,
  "city": "Example City",
  "district": "Central",
  "state": "Example State",
  "postal_code": "10001"
}
```

Required: `title` (5–200 characters), `description` (20–10,000 characters). Other fields are optional. Latitude must be -90..90 and longitude -180..180. `category` is currently advisory: classification is performed by the server.

Success: `201 Created`.

```json
{
  "message": "Complaint submitted successfully.",
  "complaint": {
    "id": "<uuid>",
    "complaint_id": "CP-2026-000001",
    "complaint_number": "CP-2026-000001",
    "title": "Large pothole near school",
    "description": "...",
    "category": "Roads",
    "status": "Pending",
    "status_code": "PENDING",
    "priority": "HIGH",
    "severity": "HIGH",
    "ai_confidence": 0.8,
    "duplicate_probability": 0.1,
    "department": "Public Works Department",
    "area": "Ward 4",
    "location": "Ward 4",
    "latitude": 40.7128,
    "longitude": -74.006,
    "address": "12 Main Street",
    "citizen_id": "<uuid>",
    "assigned_officer_id": null,
    "created_at": "<iso-8601>",
    "updated_at": "<iso-8601>",
    "resolved_at": null
  },
  "analysis": {
    "category": "Roads",
    "subcategory": "...",
    "severity": "HIGH",
    "priority": "HIGH",
    "department": "Public Works Department",
    "confidence": 0.8,
    "duplicate_probability": 0.1,
    "explanation": "...",
    "model": "..."
  },
  "duplicates": []
}
```

Numbers, classification fields, and duplicate results are examples; AI scores are estimates, not guarantees. Complaint numbers are allocated by PostgreSQL and are formatted `CP-<UTC year>-<six-digit sequence>`. A high duplicate score can initially set status to `POTENTIAL_DUPLICATE`.

### Complaint reads

- `GET /api/complaints/my` — citizen's complaints, newest first.
- `GET /api/complaints` — all complaints for admin; assigned-to-me and unassigned for officers; own complaints for citizens.
- `GET /api/complaints/{complaint_id}` — a single complaint; ownership/assignment rules apply.
- `GET /api/complaints/{complaint_id}/timeline` — ordered status history:

```json
{"timeline": [{"status": "PENDING", "comment": "Complaint submitted by citizen.", "created_at": "<iso-8601>"}]}
```

Complaint read responses use `{"complaints": [...]}` or `{"complaint": {...}}`. The complaint object includes both a display `status` and machine-readable `status_code`.

### `POST /api/complaints/{complaint_id}/feedback`

Citizen owner only; allowed after resolution and once per complaint.

```json
{"rating": 5, "comment": "The repair was completed promptly."}
```

`rating` is an integer 1–5. `comment` is optional and up to 2,000 characters. Success (`201`):

```json
{"message": "Feedback recorded.", "feedback_id": "<uuid>"}
```

Returns `409` if the complaint is not resolved or feedback has already been submitted.

### `POST /api/complaints/{complaint_id}/attachments`

Multipart form upload with field name `file`; allowed MIME types: `image/jpeg`, `image/png`, `application/pdf`. Maximum file size is `MAX_UPLOAD_BYTES` (default 5 MiB). The API generates the stored filename.

```bash
curl -X POST "http://localhost:8000/api/complaints/<complaint-uuid>/attachments" \
  -H "Authorization: Bearer <access_token>" \
  -F "file=@evidence.jpg;type=image/jpeg"
```

Success (`201`): `{"message":"Attachment uploaded.","filename":"<generated-name>.jpg"}`. Files are stored on the backend host under `UPLOAD_DIR`; this API currently has no attachment download route.

## Notifications

### `GET /api/notifications`

Authenticated user only. Returns up to the latest 100 notifications:

```json
{"notifications": [{"id": "<uuid>", "title": "Complaint received", "message": "...", "type": "COMPLAINT_SUBMITTED", "is_read": false, "created_at": "<iso-8601>"}]}
```

### `PUT /api/notifications/{notification_id}/read`

Marks the caller's notification as read. Other users' notification IDs return `404`.

```json
{"message": "Notification marked as read."}
```

## Officer workflow

Officer complaint listing/detail and status updates are scoped to unassigned or self-assigned work. Admin can also call the officer queue/status routes.

- `GET /api/officer/complaints` — visible queue.
- `GET /api/officer/complaints/{complaint_id}` — detail.
- `PUT /api/officer/complaints/{complaint_id}/status` — set status and record a timeline entry. Body:

```json
{"status": "IN_PROGRESS", "comment": "Crew dispatched."}
```

Allowed statuses: `PENDING`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, `REJECTED`. Comment is optional, max 2,000 characters. On update, the API notifies the citizen and writes an audit record.

- `POST /api/officer/complaints/{complaint_id}/resolve` — sets status to `RESOLVED`. Body may be omitted; optionally pass a `StatusUpdate` body, e.g. `{"status":"RESOLVED","comment":"Repair verified."}`. Any supplied status is overridden to `RESOLVED`.
- `PUT /api/officer/complaints/{complaint_id}/assign` — **admin only**, body `{"officer_id":"<officer-uuid>"}`. The target must be an active officer. A pending complaint becomes assigned; both officer and citizen are notified.
- `GET /api/officer/clusters` — groups with at least two complaints by area and category:

```json
{"clusters": [{"area": "Ward 4", "category_id": "<uuid>", "complaint_count": 2}]}
```

## Analytics, clusters, predictions, and alerts

- `GET /api/analytics/overview` — authenticated; for citizens the totals, categories, trend, and predictions are scoped to their complaints. Returns `overview`, `categories`, `trend`, `clusters`, `hotspots`, and `riskAlert`.
- `GET /api/predictions` and `GET /api/officer/predictions` — authenticated predictions from visible complaint records:

```json
{"predictions": [], "label": "AI-estimated risk"}
```

- `GET /api/clusters` — officer/admin aggregate area/category groups (at least two complaints).
- `GET /api/hotspots` — officer/admin areas with at least two complaints.
- `GET /api/alerts` — authenticated active public alerts.

Risk values are calculated estimates from stored records; they are not guaranteed forecasts. Empty database results produce empty arrays/null risk alerts rather than fabricated records.

### Admin analytics routes

All require the `ADMIN` role:

- `GET /api/admin/dashboard` — `overview`, user count, department count.
- `GET /api/admin/analytics` — overview, category/department/severity distributions, hotspots, prediction statistics.
- `GET /api/admin/clusters`, `/api/admin/hotspots`, `/api/admin/predictions` — database-derived intelligence. Admin predictions include label `"AI-estimated risk"`.

## Admin management routes

All require the `ADMIN` role:

- `GET /api/admin/users` (alias `GET /api/users`) — user summaries.
- `GET /api/admin/officers` — officer summaries.
- `GET /api/admin/complaints` — all complaint summaries.
- `GET /api/admin/complaints/{complaint_id}` — complaint detail.
- `GET /api/admin/departments` (alias `GET /api/departments`) — `{id, name, active}` department records.
- `GET /api/admin/alerts` — all alerts, including inactive status.
- `GET /api/admin/audit-logs` — latest 500 audit entries.

### `POST /api/admin/alerts`

Creates a public alert and sends a notification to each active citizen.

```json
{
  "title": "Drainage maintenance",
  "description": "Avoid the westbound service lane while crews clear the storm drain.",
  "severity": "MODERATE",
  "area": "Ward 4",
  "latitude": 40.7128,
  "longitude": -74.006
}
```

`title` 3–180 characters; `description` 5–5,000; severity is `LOW`, `MODERATE`, `HIGH`, or `CRITICAL`. Area and coordinates are optional.

Success (`201`):

```json
{"alert": {"id": "<uuid>", "title": "Drainage maintenance", "description": "...", "severity": "MODERATE", "area": "Ward 4"}}
```

## Example end-to-end flow

1. Check `GET /api/health`; database should be `connected`, authentication `configured`.
2. Register a citizen with `POST /api/auth/register` or create an officer/admin account through the trusted provisioning script.
3. Login with `POST /api/auth/login` using form fields `username=<email>` and `password=<password>`.
4. Use `Authorization: Bearer <access_token>` for protected operations.
5. Submit a citizen complaint, optionally upload evidence, and retain `complaint.id` and `complaint_number`.
6. An admin may assign it; an officer updates status. The citizen reads the timeline/notifications and provides feedback after resolution.

Example login:

```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "username=citizen@example.org" \
  --data-urlencode "password=a-long-password"
```

Example authenticated request:

```bash
curl "http://localhost:8000/api/complaints/my" \
  -H "Authorization: Bearer <access_token>"
```

## Operational and security notes

- Configure `DATABASE_URL` and `JWT_SECRET` only in ignored `backend/.env`; never use frontend `VITE_*` variables for server secrets.
- Apply schema migrations with `alembic upgrade head` from the backend directory.
- Configure `FRONTEND_URL` to the exact browser origin allowed by CORS.
- The API is designed for Supabase/PostgreSQL. Complaint numbering and several analytics queries use PostgreSQL features.
- Registration provisions citizen role only. Provision officer/admin identities through a trusted process.
- Current attachment storage is local to the backend machine. Public deployment needs private object storage, file-signature validation, malware scanning, and download authorization.
- Do not expose this development API publicly without HTTPS, deployment-grade rate limiting, secret management, backups, and production review.
