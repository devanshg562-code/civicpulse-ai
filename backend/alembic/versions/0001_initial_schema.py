"""Initial CivicPulse AI schema.

Revision ID: 0001_initial_schema
Revises:
"""
import uuid

from alembic import op
from sqlalchemy import insert

from app.database.base import Base
from app.database import models

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)
    roles = [{"id": uuid.uuid4(), "name": name} for name in ("CITIZEN", "OFFICER", "ADMIN")]
    op.bulk_insert(models.Role.__table__, roles)
    departments = [
        "Water Supply Department",
        "Electrical Maintenance Department",
        "Public Works Department",
        "Sanitation Department",
        "Municipal Drainage Department",
        "Transport Department",
        "Public Health Department",
        "Public Safety Bureau",
        "Municipal Services",
    ]
    department_ids = {name: uuid.uuid4() for name in departments}
    op.bulk_insert(models.Department.__table__, [{"id": id_, "name": name, "active": True} for name, id_ in department_ids.items()])
    category_departments = {
        "Water": "Water Supply Department",
        "Electricity": "Electrical Maintenance Department",
        "Roads": "Public Works Department",
        "Garbage": "Sanitation Department",
        "Drainage": "Municipal Drainage Department",
        "Street Lights": "Electrical Maintenance Department",
        "Public Transport": "Transport Department",
        "Sanitation": "Public Health Department",
        "Pollution": "Public Health Department",
        "Public Safety": "Public Safety Bureau",
        "Other": "Municipal Services",
    }
    op.bulk_insert(
        models.ComplaintCategory.__table__,
        [{"id": uuid.uuid4(), "name": name, "department_id": department_ids[department]} for name, department in category_departments.items()],
    )


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
