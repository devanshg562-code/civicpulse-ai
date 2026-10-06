import os
import sys
import uuid
from pathlib import Path

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.security import hash_password
from app.database.models import Complaint, ComplaintCategory, ComplaintStatusHistory, Department, Role, User
from app.database.session import SessionLocal


def main() -> None:
    if os.getenv("ENABLE_DEMO_SEED") != "true":
        raise SystemExit("Set ENABLE_DEMO_SEED=true to explicitly enable optional demonstration seed users and complaints.")
    if SessionLocal is None:
        raise SystemExit("DATABASE_URL is required; refusing to seed a local fallback database.")
    with SessionLocal() as db:
        accounts = [
            ("Asha Verma", "admin@civicpulse.demo", "CivicPulse@123", "ADMIN"),
            ("Officer One", "officer1@civicpulse.demo", "Officer@123", "OFFICER"),
            ("Citizen One", "citizen1@civicpulse.demo", "Citizen@123", "CITIZEN"),
        ]
        users: dict[str, User] = {}
        for name, email, password, role_name in accounts:
            user = db.scalar(select(User).where(User.email == email))
            if not user:
                role = db.scalar(select(Role).where(Role.name == role_name))
                user = User(name=name, email=email, password_hash=hash_password(password), role=role)
                db.add(user)
                db.flush()
            users[role_name] = user
        if db.scalar(select(Complaint.id).limit(1)) is None:
            category = db.scalar(select(ComplaintCategory).where(ComplaintCategory.name == "Roads"))
            department = db.scalar(select(Department).where(Department.name == "Public Works Department"))
            complaint = Complaint(
                complaint_number=f"SEED-{uuid.uuid4().hex[:10].upper()}",
                citizen_id=users["CITIZEN"].id,
                assigned_officer_id=users["OFFICER"].id,
                title="Sample pothole report (optional seed)",
                description="Optional sample record for local demonstration only.",
                category=category,
                department=department,
                status="ASSIGNED",
                priority="MEDIUM",
                severity="MODERATE",
                area="Demo Ward",
                ward="Demo Ward",
                latitude=28.6139,
                longitude=77.209,
            )
            db.add(complaint)
            db.flush()
            db.add(ComplaintStatusHistory(complaint_id=complaint.id, changed_by=users["OFFICER"].id, status=complaint.status, comment="Optional demonstration seed."))
        db.commit()
    print("Optional seed data inserted into the configured PostgreSQL database.")


if __name__ == "__main__":
    main()
