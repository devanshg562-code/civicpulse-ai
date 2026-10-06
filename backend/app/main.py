import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import Date, cast, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.security import create_access_token, get_current_user, hash_password, require_roles, verify_password
from app.database.models import (
    AIAnalysisResult,
    AuditLog,
    Complaint,
    ComplaintAttachment,
    ComplaintCategory,
    ComplaintCluster,
    ComplaintCounter,
    ComplaintLocation,
    ComplaintStatusHistory,
    ClusterMember,
    Department,
    Feedback,
    Notification,
    PredictiveAlert,
    RevokedToken,
    Role,
    User,
)
from app.database.session import engine, get_db
from app.schemas import AlertCreate, AssignRequest, ComplaintCreate, FeedbackCreate, RegisterRequest, StatusUpdate
from app.services.ai import analyze_complaint, duplicate_score, prediction_for_area


app = FastAPI(
    title="CivicPulse AI API",
    description="Persistent civic grievance and predictive governance REST API.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_UPLOAD_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf"}
LOGIN_ATTEMPTS: dict[str, list[datetime]] = {}


def enforce_login_limit(request: Request) -> None:
    now = datetime.now(timezone.utc)
    key = request.client.host if request.client else "unknown"
    attempts = [attempt for attempt in LOGIN_ATTEMPTS.get(key, []) if (now - attempt).total_seconds() < 60]
    if len(attempts) >= 10:
        raise HTTPException(status_code=429, detail="Too many login attempts. Please wait one minute.")
    attempts.append(now)
    LOGIN_ATTEMPTS[key] = attempts


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(_request: Request, _exc: SQLAlchemyError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": "Database operation failed. Check database connectivity and migrations."})


def user_dict(user: User) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role.name.lower(),
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat(),
    }


def complaint_dict(complaint: Complaint) -> dict[str, Any]:
    category = complaint.category.name if complaint.category else "Other"
    department = complaint.department.name if complaint.department else None
    return {
        "id": str(complaint.id),
        "complaint_id": complaint.complaint_number,
        "complaint_number": complaint.complaint_number,
        "title": complaint.title,
        "description": complaint.description,
        "category": category,
        "status": complaint.status.replace("_", " ").title(),
        "status_code": complaint.status,
        "priority": complaint.priority,
        "severity": complaint.severity,
        "ai_confidence": complaint.ai_confidence,
        "duplicate_probability": complaint.duplicate_probability,
        "department": department,
        "area": complaint.area or complaint.ward,
        "location": complaint.area or complaint.ward,
        "latitude": complaint.latitude,
        "longitude": complaint.longitude,
        "address": complaint.address,
        "citizen_id": str(complaint.citizen_id),
        "assigned_officer_id": str(complaint.assigned_officer_id) if complaint.assigned_officer_id else None,
        "created_at": complaint.created_at.isoformat(),
        "updated_at": complaint.updated_at.isoformat(),
        "resolved_at": complaint.resolved_at.isoformat() if complaint.resolved_at else None,
    }


def log_audit(db: Session, user_id: uuid.UUID | None, action: str, resource: str, resource_id: str | None, metadata: dict[str, Any] | None = None) -> None:
    db.add(AuditLog(user_id=user_id, action=action, resource=resource, resource_id=resource_id, metadata_json=json.dumps(metadata or {})))


def notify(db: Session, user_id: uuid.UUID, title: str, message: str, kind: str, complaint_id: uuid.UUID | None = None) -> None:
    db.add(Notification(user_id=user_id, complaint_id=complaint_id, title=title, message=message, type=kind))


def load_complaint(db: Session, complaint_id: uuid.UUID) -> Complaint:
    complaint = db.scalar(
        select(Complaint)
        .options(joinedload(Complaint.category), joinedload(Complaint.department), joinedload(Complaint.citizen), joinedload(Complaint.assigned_officer))
        .where(Complaint.id == complaint_id)
    )
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    return complaint


def assert_complaint_access(complaint: Complaint, user: User) -> None:
    if user.role.name == "CITIZEN" and complaint.citizen_id != user.id:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    if user.role.name == "OFFICER" and complaint.assigned_officer_id not in (None, user.id):
        raise HTTPException(status_code=403, detail="This complaint is assigned to another officer.")


def next_complaint_number(db: Session) -> str:
    if engine is None or engine.dialect.name != "postgresql":
        raise HTTPException(status_code=503, detail="Complaint numbering requires the configured PostgreSQL database.")
    year = datetime.now(timezone.utc).year
    statement = pg_insert(ComplaintCounter).values(year=year, value=1)
    statement = statement.on_conflict_do_update(index_elements=[ComplaintCounter.year], set_={"value": ComplaintCounter.value + 1}).returning(ComplaintCounter.value)
    sequence = db.scalar(statement)
    return f"CP-{year}-{sequence:06d}"


@app.get("/api/health")
def health() -> dict[str, str]:
    database_status = "not_configured"
    if engine is not None:
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            database_status = "connected"
        except SQLAlchemyError:
            database_status = "disconnected"
    authentication_status = "configured" if settings.jwt_secret else "not_configured"
    return {
        "api": "healthy",
        "database": database_status,
        "authentication": authentication_status,
        "ai": "ready",
    }


@app.post("/api/auth/register", status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    email = payload.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    role = db.scalar(select(Role).where(Role.name == "CITIZEN"))
    if not role:
        raise HTTPException(status_code=503, detail="Database roles are missing. Run the database migrations.")
    user = User(name=payload.name.strip(), email=email, phone=payload.phone, password_hash=hash_password(payload.password), role=role)
    db.add(user)
    db.flush()
    log_audit(db, user.id, "register", "user", str(user.id))
    token, _jti, _expires = create_access_token(user)
    db.commit()
    db.refresh(user)
    return {"token": token, "token_type": "bearer", "user": user_dict(user)}


@app.post("/api/auth/login")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> dict[str, Any]:
    enforce_login_limit(request)
    user = db.scalar(select(User).options(joinedload(User.role)).where(User.email == form.username.strip().lower()))
    if not user or not user.is_active or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token, _jti, _expires = create_access_token(user)
    log_audit(db, user.id, "login", "auth", str(user.id))
    db.commit()
    return {"access_token": token, "token": token, "token_type": "bearer", "user": user_dict(user)}


@app.post("/api/auth/logout")
def logout(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, str]:
    from jose import jwt

    raw_token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    claims = jwt.get_unverified_claims(raw_token)
    jti = claims.get("jti")
    expires = datetime.fromtimestamp(claims["exp"], timezone.utc)
    if jti and not db.get(RevokedToken, jti):
        db.add(RevokedToken(jti=jti, expires_at=expires))
    log_audit(db, user.id, "logout", "auth", str(user.id))
    db.commit()
    return {"message": "Logged out."}


@app.get("/api/auth/me")
def me(user: User = Depends(get_current_user)) -> dict[str, Any]:
    return {"user": user_dict(user)}


@app.post("/api/complaints", status_code=201)
def create_complaint(payload: ComplaintCreate, user: User = Depends(require_roles("CITIZEN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    analysis = analyze_complaint(payload.title, payload.description, db)
    category = db.scalar(select(ComplaintCategory).where(ComplaintCategory.name.ilike(str(analysis["category"]))))
    department = db.scalar(select(Department).where(Department.name.ilike(str(analysis["department"]))))
    if not department:
        department = db.scalar(select(Department).where(Department.name == "Municipal Services"))
    area = payload.ward or payload.location
    duplicate_probability, similar = duplicate_score(f"{payload.title} {payload.description}", category.id if category else None, area, db)
    number = next_complaint_number(db)
    complaint = Complaint(
        complaint_number=number,
        citizen_id=user.id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        category=category,
        department=department,
        status="POTENTIAL_DUPLICATE" if duplicate_probability >= 0.75 else "PENDING",
        priority=str(analysis["priority"]),
        severity=str(analysis["severity"]),
        ai_confidence=float(analysis["confidence"]),
        duplicate_probability=round(duplicate_probability, 4),
        area=area,
        ward=payload.ward,
        address=payload.address,
        latitude=payload.latitude,
        longitude=payload.longitude,
        city=payload.city,
        district=payload.district,
        state=payload.state,
        postal_code=payload.postal_code,
    )
    db.add(complaint)
    db.flush()
    if area and category:
        existing_in_area = db.scalars(
            select(Complaint).where(
                Complaint.area == area,
                Complaint.category_id == category.id,
                Complaint.id != complaint.id,
            )
        ).all()
        if existing_in_area:
            cluster = db.scalar(
                select(ComplaintCluster).where(
                    ComplaintCluster.area == area,
                    ComplaintCluster.category_id == category.id,
                )
            )
            if not cluster:
                cluster = ComplaintCluster(
                    title=f"{category.name} reports in {area}",
                    category_id=category.id,
                    area=area,
                    severity=complaint.severity,
                    trend="MONITORING",
                )
                db.add(cluster)
                db.flush()
            complaint.cluster_id = cluster.id
            for existing in existing_in_area:
                existing.cluster_id = cluster.id
                if not db.scalar(
                    select(ClusterMember.id).where(
                        ClusterMember.cluster_id == cluster.id,
                        ClusterMember.complaint_id == existing.id,
                    )
                ):
                    db.add(ClusterMember(cluster_id=cluster.id, complaint_id=existing.id))
            db.add(ClusterMember(cluster_id=cluster.id, complaint_id=complaint.id))
    if payload.latitude is not None and payload.longitude is not None:
        db.add(ComplaintLocation(complaint_id=complaint.id, latitude=payload.latitude, longitude=payload.longitude, address=payload.address, city=payload.city, district=payload.district, state=payload.state, postal_code=payload.postal_code, ward=payload.ward))
    db.add(ComplaintStatusHistory(complaint_id=complaint.id, changed_by=user.id, status=complaint.status, comment="Complaint submitted by citizen."))
    db.add(AIAnalysisResult(complaint_id=complaint.id, model_name=str(analysis["model"]), category=str(analysis["category"]), subcategory=str(analysis["subcategory"]), severity=str(analysis["severity"]), priority=str(analysis["priority"]), department=str(analysis["department"]), confidence=float(analysis["confidence"]), duplicate_probability=duplicate_probability, explanation=str(analysis["explanation"])))
    notify(db, user.id, "Complaint received", f"Your complaint {number} has been received.", "COMPLAINT_SUBMITTED", complaint.id)
    officers = db.scalars(select(User).options(joinedload(User.role)).join(Role).where(Role.name == "OFFICER", User.is_active.is_(True))).all()
    for officer in officers:
        notify(db, officer.id, "New complaint in queue", f"{number}: {payload.title}", "COMPLAINT_SUBMITTED", complaint.id)
    log_audit(db, user.id, "complaint_created", "complaint", str(complaint.id), {"complaint_number": number, "duplicate_probability": duplicate_probability})
    db.commit()
    complaint = load_complaint(db, complaint.id)
    return {
        "message": "Complaint submitted successfully.",
        "complaint": complaint_dict(complaint),
        "analysis": analysis,
        "duplicates": [complaint_dict(item) for item in similar],
    }


@app.get("/api/complaints/my")
def my_complaints(user: User = Depends(require_roles("CITIZEN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    complaints = db.scalars(select(Complaint).options(joinedload(Complaint.category), joinedload(Complaint.department)).where(Complaint.citizen_id == user.id).order_by(Complaint.created_at.desc())).unique().all()
    return {"complaints": [complaint_dict(item) for item in complaints]}


@app.get("/api/complaints")
def list_complaints(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    query = select(Complaint).options(joinedload(Complaint.category), joinedload(Complaint.department))
    if user.role.name == "CITIZEN":
        query = query.where(Complaint.citizen_id == user.id)
    elif user.role.name == "OFFICER":
        query = query.where((Complaint.assigned_officer_id == user.id) | (Complaint.assigned_officer_id.is_(None)))
    complaints = db.scalars(query.order_by(Complaint.created_at.desc())).unique().all()
    return {"complaints": [complaint_dict(item) for item in complaints]}


@app.get("/api/complaints/{complaint_id}/timeline")
def complaint_timeline(complaint_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    complaint = load_complaint(db, complaint_id)
    assert_complaint_access(complaint, user)
    history = db.scalars(select(ComplaintStatusHistory).where(ComplaintStatusHistory.complaint_id == complaint.id).order_by(ComplaintStatusHistory.created_at)).all()
    return {"timeline": [{"status": row.status, "comment": row.comment, "created_at": row.created_at.isoformat()} for row in history]}


@app.get("/api/complaints/{complaint_id}")
def complaint_detail(complaint_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    complaint = load_complaint(db, complaint_id)
    assert_complaint_access(complaint, user)
    return {"complaint": complaint_dict(complaint)}


@app.post("/api/complaints/{complaint_id}/feedback", status_code=201)
def submit_feedback(complaint_id: uuid.UUID, payload: FeedbackCreate, user: User = Depends(require_roles("CITIZEN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    complaint = load_complaint(db, complaint_id)
    if complaint.citizen_id != user.id:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    if complaint.status != "RESOLVED":
        raise HTTPException(status_code=409, detail="Feedback is available after a complaint is resolved.")
    if db.scalar(select(Feedback.id).where(Feedback.complaint_id == complaint.id, Feedback.user_id == user.id)):
        raise HTTPException(status_code=409, detail="Feedback has already been submitted.")
    feedback = Feedback(complaint_id=complaint.id, user_id=user.id, rating=payload.rating, comment=payload.comment)
    db.add(feedback)
    log_audit(db, user.id, "feedback_submitted", "complaint", str(complaint.id))
    db.commit()
    return {"message": "Feedback recorded.", "feedback_id": str(feedback.id)}


@app.get("/api/notifications")
def notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    items = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(100)).all()
    return {"notifications": [{"id": str(item.id), "title": item.title, "message": item.message, "type": item.type, "is_read": item.is_read, "created_at": item.created_at.isoformat()} for item in items]}


@app.put("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, str]:
    item = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if not item:
        raise HTTPException(status_code=404, detail="Notification not found.")
    item.is_read = True
    db.commit()
    return {"message": "Notification marked as read."}


def officer_complaints_query(user: User):
    query = select(Complaint).options(joinedload(Complaint.category), joinedload(Complaint.department))
    if user.role.name == "OFFICER":
        query = query.where((Complaint.assigned_officer_id == user.id) | (Complaint.assigned_officer_id.is_(None)))
    return query.order_by(Complaint.created_at.desc())


@app.get("/api/officer/complaints")
def officer_complaints(user: User = Depends(require_roles("OFFICER", "ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    complaints = db.scalars(officer_complaints_query(user)).unique().all()
    return {"complaints": [complaint_dict(item) for item in complaints]}


@app.get("/api/officer/complaints/{complaint_id}")
def officer_complaint_detail(complaint_id: uuid.UUID, user: User = Depends(require_roles("OFFICER", "ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    complaint = load_complaint(db, complaint_id)
    assert_complaint_access(complaint, user)
    return {"complaint": complaint_dict(complaint)}


@app.put("/api/officer/complaints/{complaint_id}/status")
def officer_update_status(complaint_id: uuid.UUID, payload: StatusUpdate, user: User = Depends(require_roles("OFFICER", "ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    complaint = load_complaint(db, complaint_id)
    assert_complaint_access(complaint, user)
    complaint.status = payload.status
    if payload.status == "RESOLVED":
        complaint.resolved_at = datetime.now(timezone.utc)
    db.add(ComplaintStatusHistory(complaint_id=complaint.id, changed_by=user.id, status=payload.status, comment=payload.comment))
    notify(db, complaint.citizen_id, "Complaint status updated", f"{complaint.complaint_number} is now {payload.status.replace('_', ' ').title()}.", "STATUS_CHANGED", complaint.id)
    log_audit(db, user.id, "complaint_status_changed", "complaint", str(complaint.id), {"status": payload.status})
    db.commit()
    return {"complaint": complaint_dict(load_complaint(db, complaint.id))}


@app.put("/api/officer/complaints/{complaint_id}/assign")
def assign_complaint(complaint_id: uuid.UUID, payload: AssignRequest, user: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    complaint = load_complaint(db, complaint_id)
    officer = db.scalar(select(User).options(joinedload(User.role)).where(User.id == payload.officer_id))
    if not officer or officer.role.name != "OFFICER" or not officer.is_active:
        raise HTTPException(status_code=422, detail="Select an active officer.")
    complaint.assigned_officer_id = officer.id
    if complaint.status == "PENDING":
        complaint.status = "ASSIGNED"
    db.add(ComplaintStatusHistory(complaint_id=complaint.id, changed_by=user.id, status=complaint.status, comment=f"Assigned to {officer.name}."))
    notify(db, officer.id, "Complaint assigned", f"{complaint.complaint_number}: {complaint.title}", "COMPLAINT_ASSIGNED", complaint.id)
    notify(db, complaint.citizen_id, "Complaint assigned", f"An officer has been assigned to {complaint.complaint_number}.", "COMPLAINT_ASSIGNED", complaint.id)
    log_audit(db, user.id, "complaint_assigned", "complaint", str(complaint.id), {"officer_id": str(officer.id)})
    db.commit()
    return {"complaint": complaint_dict(load_complaint(db, complaint.id))}


@app.post("/api/officer/complaints/{complaint_id}/resolve")
def resolve_complaint(complaint_id: uuid.UUID, payload: StatusUpdate | None = None, user: User = Depends(require_roles("OFFICER", "ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    request_payload = StatusUpdate(status="RESOLVED", comment="Resolved by officer.") if payload is None else payload.model_copy(update={"status": "RESOLVED"})
    return officer_update_status(complaint_id, request_payload, user, db)


@app.get("/api/officer/clusters")
def officer_clusters(user: User = Depends(require_roles("OFFICER", "ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    _ = user
    rows = db.execute(select(Complaint.area, Complaint.category_id, func.count(Complaint.id)).where(Complaint.area.is_not(None)).group_by(Complaint.area, Complaint.category_id).having(func.count(Complaint.id) >= 2)).all()
    return {"clusters": [{"area": area, "category_id": str(category_id) if category_id else None, "complaint_count": count} for area, category_id, count in rows]}


def _overview(db: Session) -> dict[str, Any]:
    total = db.scalar(select(func.count(Complaint.id))) or 0
    pending = db.scalar(select(func.count(Complaint.id)).where(Complaint.status.in_(["PENDING", "POTENTIAL_DUPLICATE", "ASSIGNED"]))) or 0
    resolved = db.scalar(select(func.count(Complaint.id)).where(Complaint.status == "RESOLVED")) or 0
    in_progress = db.scalar(select(func.count(Complaint.id)).where(Complaint.status == "IN_PROGRESS")) or 0
    critical = db.scalar(select(func.count(Complaint.id)).where(Complaint.severity == "CRITICAL")) or 0
    average_days = db.scalar(select(func.avg(func.extract("epoch", Complaint.resolved_at - Complaint.created_at) / 86400)).where(Complaint.resolved_at.is_not(None)))
    return {
        "totalComplaints": total,
        "pendingComplaints": pending,
        "resolvedComplaints": resolved,
        "inProgressComplaints": in_progress,
        "criticalCases": critical,
        "averageResolutionDays": round(float(average_days or 0), 1),
        "resolutionRate": round(resolved / total * 100, 1) if total else 0,
    }


@app.get("/api/analytics/overview")
def analytics_overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    query = select(Complaint).options(joinedload(Complaint.category), joinedload(Complaint.department))
    if user.role.name == "CITIZEN":
        query = query.where(Complaint.citizen_id == user.id)
    complaints = db.scalars(query).unique().all()
    categories: dict[str, int] = {}
    for item in complaints:
        name = item.category.name if item.category else "Other"
        categories[name] = categories.get(name, 0) + 1
    areas = sorted({item.area or item.ward for item in complaints if item.area or item.ward})
    predictions = [prediction_for_area(area, complaints) for area in areas]
    hotspots = [item for item in predictions if item["complaint_count"] >= 2]
    highest = max(predictions, key=lambda item: int(item["risk_score"]), default=None)
    complaint_day = cast(Complaint.created_at, Date)
    daily_counts = db.execute(
        select(complaint_day, func.count(Complaint.id))
        .where(Complaint.citizen_id == user.id if user.role.name == "CITIZEN" else text("true"))
        .group_by(complaint_day)
        .order_by(complaint_day.desc())
        .limit(14)
    ).all()
    return {
        "overview": _overview(db) if user.role.name != "CITIZEN" else _overview_for_user(db, user.id),
        "categories": [{"name": name, "value": value} for name, value in categories.items()],
        "trend": [{"name": day.strftime("%b %d"), "value": count} for day, count in reversed(daily_counts)],
        "clusters": [],
        "hotspots": hotspots,
        "riskAlert": {
            "area": highest["area"],
            "issue": highest["predicted_issue"],
            "riskScore": highest["risk_score"],
            "riskLevel": highest["risk_level"],
            "label": highest["label"],
        } if highest else None,
    }


def _overview_for_user(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    rows = db.scalars(select(Complaint).where(Complaint.citizen_id == user_id)).all()
    total = len(rows)
    resolved = sum(item.status == "RESOLVED" for item in rows)
    return {
        "totalComplaints": total,
        "pendingComplaints": sum(item.status in {"PENDING", "ASSIGNED", "POTENTIAL_DUPLICATE"} for item in rows),
        "resolvedComplaints": resolved,
        "inProgressComplaints": sum(item.status == "IN_PROGRESS" for item in rows),
        "criticalCases": sum(item.severity == "CRITICAL" for item in rows),
        "averageResolutionDays": 0,
        "resolutionRate": round(resolved / total * 100, 1) if total else 0,
    }


@app.get("/api/predictions")
@app.get("/api/officer/predictions")
def predictions(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    query = select(Complaint).options(joinedload(Complaint.category))
    if user.role.name == "CITIZEN":
        query = query.where(Complaint.citizen_id == user.id)
    complaints = db.scalars(query).unique().all()
    areas = sorted({item.area or item.ward for item in complaints if item.area or item.ward})
    results = [prediction_for_area(area, complaints) for area in areas]
    return {"predictions": results, "label": "AI-estimated risk"}


@app.get("/api/clusters")
def clusters(user: User = Depends(require_roles("OFFICER", "ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    return officer_clusters(user, db)


@app.get("/api/hotspots")
def hotspots(user: User = Depends(require_roles("OFFICER", "ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    results = predictions(user, db)["predictions"]
    return {"hotspots": [item for item in results if item["complaint_count"] >= 2]}


@app.get("/api/alerts")
def active_alerts(_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    alerts = db.scalars(select(PredictiveAlert).where(PredictiveAlert.is_public.is_(True), PredictiveAlert.status == "ACTIVE").order_by(PredictiveAlert.created_at.desc())).all()
    return {"alerts": [{"id": str(item.id), "title": item.title, "description": item.description, "severity": item.severity, "area": item.area, "risk_score": item.risk_score} for item in alerts]}


@app.get("/api/admin/dashboard")
def admin_dashboard(_admin: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"overview": _overview(db), "users": db.scalar(select(func.count(User.id))) or 0, "departments": db.scalar(select(func.count(Department.id))) or 0}


@app.get("/api/admin/users")
@app.get("/api/users")
def admin_users(_admin: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    users = db.scalars(select(User).options(joinedload(User.role)).order_by(User.created_at.desc())).unique().all()
    return {"users": [user_dict(item) for item in users]}


@app.get("/api/admin/officers")
def admin_officers(_admin: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    officers = db.scalars(select(User).options(joinedload(User.role)).join(Role).where(Role.name == "OFFICER")).unique().all()
    return {"officers": [user_dict(item) for item in officers]}


@app.get("/api/admin/complaints")
def admin_complaints(_admin: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    complaints = db.scalars(select(Complaint).options(joinedload(Complaint.category), joinedload(Complaint.department)).order_by(Complaint.created_at.desc())).unique().all()
    return {"complaints": [complaint_dict(item) for item in complaints]}


@app.get("/api/admin/departments")
@app.get("/api/departments")
def admin_departments(_admin: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    departments = db.scalars(select(Department).order_by(Department.name)).all()
    return {"departments": [{"id": str(item.id), "name": item.name, "active": item.active} for item in departments]}


@app.get("/api/admin/clusters")
def admin_clusters(_admin: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    groups = db.execute(select(Complaint.area, Complaint.category_id, func.count(Complaint.id)).where(Complaint.area.is_not(None)).group_by(Complaint.area, Complaint.category_id).having(func.count(Complaint.id) >= 2)).all()
    return {"clusters": [{"area": area, "category_id": str(category) if category else None, "complaint_count": count} for area, category, count in groups]}


@app.get("/api/admin/hotspots")
def admin_hotspots(_admin: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"hotspots": _hotspots_from_db(db)}


def _hotspots_from_db(db: Session) -> list[dict[str, Any]]:
    complaints = db.scalars(select(Complaint).options(joinedload(Complaint.category))).unique().all()
    areas = sorted({item.area or item.ward for item in complaints if item.area or item.ward})
    return [prediction_for_area(area, complaints) for area in areas if sum((item.area or item.ward or "").casefold() == area.casefold() for item in complaints) >= 2]


@app.get("/api/admin/predictions")
def admin_predictions(_admin: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"predictions": _hotspots_from_db(db), "label": "AI-estimated risk"}


@app.get("/api/admin/analytics")
def admin_analytics(_admin: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    complaints = db.scalars(select(Complaint).options(joinedload(Complaint.category), joinedload(Complaint.department))).unique().all()
    by_category: dict[str, int] = {}
    by_department: dict[str, int] = {}
    for item in complaints:
        category = item.category.name if item.category else "Other"
        department = item.department.name if item.department else "Unassigned"
        by_category[category] = by_category.get(category, 0) + 1
        by_department[department] = by_department.get(department, 0) + 1
    return {
        "overview": _overview(db),
        "category_distribution": [{"name": name, "value": count} for name, count in by_category.items()],
        "department_performance": [{"name": name, "value": count} for name, count in by_department.items()],
        "severity_distribution": [{"name": severity, "value": sum(item.severity == severity for item in complaints)} for severity in ("LOW", "MODERATE", "HIGH", "CRITICAL")],
        "hotspots": _hotspots_from_db(db),
        "prediction_statistics": {"areas_analyzed": len(_hotspots_from_db(db))},
        "trend": [],
    }


@app.post("/api/admin/alerts", status_code=201)
def create_alert(payload: AlertCreate, admin: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    alert = PredictiveAlert(title=payload.title, description=payload.description, severity=payload.severity, area=payload.area, latitude=payload.latitude, longitude=payload.longitude, is_public=True, created_by=admin.id)
    db.add(alert)
    db.flush()
    citizens = db.scalars(select(User).options(joinedload(User.role)).join(Role).where(Role.name == "CITIZEN", User.is_active.is_(True))).all()
    for citizen in citizens:
        notify(db, citizen.id, payload.title, payload.description, "PUBLIC_ALERT")
    log_audit(db, admin.id, "alert_created", "alert", str(alert.id), {"severity": alert.severity})
    db.commit()
    return {"alert": {"id": str(alert.id), "title": alert.title, "description": alert.description, "severity": alert.severity, "area": alert.area}}


@app.get("/api/admin/alerts")
def list_admin_alerts(_admin: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    alerts = db.scalars(select(PredictiveAlert).order_by(PredictiveAlert.created_at.desc())).all()
    return {"alerts": [{"id": str(item.id), "title": item.title, "description": item.description, "severity": item.severity, "area": item.area, "status": item.status} for item in alerts]}


@app.get("/api/admin/audit-logs")
def audit_logs(_admin: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    logs = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(500)).all()
    return {"audit_logs": [{"id": str(item.id), "user_id": str(item.user_id) if item.user_id else None, "action": item.action, "resource": item.resource, "resource_id": item.resource_id, "metadata": json.loads(item.metadata_json or "{}"), "created_at": item.created_at.isoformat()} for item in logs]}


@app.post("/api/complaints/{complaint_id}/attachments", status_code=201)
async def upload_attachment(complaint_id: uuid.UUID, file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, str]:
    complaint = load_complaint(db, complaint_id)
    assert_complaint_access(complaint, user)
    extension = ALLOWED_UPLOAD_TYPES.get(file.content_type or "")
    if not extension:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, and PDF files are allowed.")
    contents = await file.read(settings.max_upload_bytes + 1)
    if len(contents) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File exceeds the configured upload size limit.")
    safe_name = f"{uuid.uuid4()}{extension}"
    destination = Path(settings.upload_dir).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    file_path = destination / safe_name
    file_path.write_bytes(contents)
    attachment = ComplaintAttachment(complaint_id=complaint.id, filename=safe_name, mime_type=file.content_type, storage_path=str(file_path))
    db.add(attachment)
    db.commit()
    return {"message": "Attachment uploaded.", "filename": safe_name}


@app.get("/api/admin/complaints/{complaint_id}")
def admin_complaint_detail(complaint_id: uuid.UUID, _admin: User = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"complaint": complaint_dict(load_complaint(db, complaint_id))}
