import getpass
import sys
from pathlib import Path

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.security import hash_password
from app.database.models import Role, User
from app.database.session import SessionLocal


def main() -> None:
    if SessionLocal is None:
        raise SystemExit("DATABASE_URL is required; no local/demo database fallback is supported.")
    name = input("Full name: ").strip()
    email = input("Email: ").strip().lower()
    role_name = input("Role (OFFICER or ADMIN): ").strip().upper()
    if role_name not in {"OFFICER", "ADMIN"}:
        raise SystemExit("Only OFFICER or ADMIN accounts can be provisioned with this command.")
    password = getpass.getpass("Temporary password (minimum 10 characters): ")
    if len(password) < 10:
        raise SystemExit("Password must contain at least 10 characters.")
    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.email == email)):
            raise SystemExit("That email is already registered.")
        role = db.scalar(select(Role).where(Role.name == role_name))
        if not role:
            raise SystemExit("Role rows are missing. Run alembic upgrade head first.")
        user = User(name=name, email=email, password_hash=hash_password(password), role=role)
        db.add(user)
        db.commit()
    print(f"{role_name} account provisioned for {email}.")


if __name__ == "__main__":
    main()
