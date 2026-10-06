from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=10, max_length=128)
    phone: str | None = Field(default=None, max_length=40)


class LoginRequest(BaseModel):
    email: str
    password: str


class ComplaintCreate(BaseModel):
    title: str = Field(min_length=5, max_length=200)
    description: str = Field(min_length=20, max_length=10000)
    category: str | None = Field(default=None, max_length=80)
    location: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=300)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    city: str | None = Field(default=None, max_length=100)
    district: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    ward: str | None = Field(default=None, max_length=80)


class FeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class StatusUpdate(BaseModel):
    status: str = Field(pattern="^(PENDING|ASSIGNED|IN_PROGRESS|RESOLVED|REJECTED)$")
    comment: str | None = Field(default=None, max_length=2000)


class AssignRequest(BaseModel):
    officer_id: UUID


class AlertCreate(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    description: str = Field(min_length=5, max_length=5000)
    severity: str = Field(pattern="^(LOW|MODERATE|HIGH|CRITICAL)$")
    area: str | None = Field(default=None, max_length=160)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class UserResponse(BaseModel):
    id: UUID
    name: str
    email: str
    phone: str | None
    role: str
    is_active: bool
    created_at: datetime


class ComplaintResponse(BaseModel):
    id: UUID
    complaint_number: str
    complaint_id: str
    title: str
    description: str
    category: str
    status: str
    priority: str
    severity: str
    ai_confidence: float
    duplicate_probability: float
    department: str | None
    area: str | None
    location: str | None
    latitude: float | None
    longitude: float | None
    address: str | None
    citizen_id: UUID
    assigned_officer_id: UUID | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    model_config = ConfigDict(from_attributes=True)
