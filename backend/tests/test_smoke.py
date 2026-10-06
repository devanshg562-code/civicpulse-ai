from fastapi.testclient import TestClient

from app.database import session
from app.main import app


def test_health_reports_database_configuration_state() -> None:
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.json()["api"] == "healthy"
    assert response.json()["ai"] == "ready"
    assert response.json()["database"] in {"connected", "disconnected", "not_configured"}
    assert response.json()["authentication"] in {"configured", "not_configured"}


def test_private_complaints_require_authentication() -> None:
    response = TestClient(app).get("/api/complaints/my")
    assert response.status_code == 401


def test_registration_reports_missing_database(monkeypatch) -> None:
    monkeypatch.setattr(session, "SessionLocal", None)
    response = TestClient(app).post(
        "/api/auth/register",
        json={"name": "Test Citizen", "email": "test@example.org", "password": "secure-password-123"},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "Database is not configured. Set DATABASE_URL in backend/.env."


def test_oauth_password_login_uses_form_credentials() -> None:
    response = TestClient(app).post(
        "/api/auth/login",
        data={"username": "citizen@example.org", "password": "secure-password-123"},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "Database is not configured. Set DATABASE_URL in backend/.env."


def test_openapi_oauth_password_flow_matches_login_endpoint() -> None:
    schema = app.openapi()
    assert schema["components"]["securitySchemes"]["OAuth2PasswordBearer"]["flows"]["password"]["tokenUrl"] == "/api/auth/login"
    assert "application/x-www-form-urlencoded" in schema["paths"]["/api/auth/login"]["post"]["requestBody"]["content"]
