import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import Complaint, ComplaintCategory


CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Roads": ("pothole", "road", "asphalt", "pavement", "street damage"),
    "Water": ("water", "leak", "pipe", "supply", "waterlogging", "flood"),
    "Drainage": ("drain", "sewer", "sewage", "blocked drain", "overflow"),
    "Electricity": ("electric", "power", "outage", "transformer", "wire"),
    "Garbage": ("garbage", "waste", "trash", "dump", "rubbish"),
    "Street Lights": ("streetlight", "street light", "lamp", "dark road", "lighting"),
    "Public Transport": ("bus", "transport", "bus stop", "transit"),
    "Sanitation": ("sanitation", "toilet", "hygiene", "public health"),
    "Pollution": ("pollution", "smoke", "dust", "air quality"),
    "Public Safety": ("safety", "unsafe", "hazard", "danger", "accident"),
}

DEPARTMENTS = {
    "Roads": "Public Works Department",
    "Water": "Water Supply Department",
    "Drainage": "Municipal Drainage Department",
    "Electricity": "Electrical Maintenance Department",
    "Garbage": "Sanitation Department",
    "Street Lights": "Electrical Maintenance Department",
    "Public Transport": "Transport Department",
    "Sanitation": "Public Health Department",
    "Pollution": "Public Health Department",
    "Public Safety": "Public Safety Bureau",
}


def _rule_classify(text: str) -> tuple[str, float]:
    lowered = text.lower()
    scores = {category: sum(lowered.count(word) for word in words) for category, words in CATEGORY_KEYWORDS.items()}
    winner = max(scores, key=scores.get)
    score = scores[winner]
    return (winner, min(0.72, 0.45 + 0.08 * score)) if score else ("Other", 0.35)


def analyze_complaint(title: str, description: str, db: Session) -> dict[str, object]:
    text = f"{title} {description}".lower()
    category_name, confidence = _rule_classify(text)
    model_name = "local-rules-fallback"
    labeled = list(db.execute(select(Complaint.title, Complaint.description, Complaint.category_id).where(Complaint.category_id.is_not(None)).limit(2000)).all())
    if len(labeled) >= 12:
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.linear_model import LogisticRegression

            category_map = {item.id: item.name for item in db.scalars(select(ComplaintCategory)).all()}
            examples = [f"{title_text} {description_text}" for title_text, description_text, _ in labeled]
            labels = [category_map.get(category_id) for _, _, category_id in labeled]
            valid = [(example, label) for example, label in zip(examples, labels) if label]
            if len(valid) >= 12 and len(set(label for _, label in valid)) > 1:
                vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=5000, min_df=1)
                matrix = vectorizer.fit_transform([example for example, _ in valid])
                classifier = LogisticRegression(max_iter=400, class_weight="balanced")
                classifier.fit(matrix, [label for _, label in valid])
                probabilities = classifier.predict_proba(vectorizer.transform([text]))[0]
                best = int(probabilities.argmax())
                if float(probabilities[best]) >= 0.55:
                    category_name, confidence = str(classifier.classes_[best]), float(probabilities[best])
                    model_name = "tfidf-logistic-regression-local"
        except (ImportError, ValueError):
            pass

    severe_terms = ("danger", "injury", "hospital", "school", "flood", "collapse", "exposed wire", "fire")
    severity = "CRITICAL" if any(word in text for word in severe_terms) else "HIGH" if any(word in text for word in ("urgent", "severe", "overflow", "large pothole")) else "MODERATE"
    priority = "URGENT" if severity == "CRITICAL" else "HIGH" if severity == "HIGH" else "MEDIUM"
    category = db.scalar(select(ComplaintCategory).where(ComplaintCategory.name == category_name))
    return {
        "category": category_name,
        "category_id": category.id if category else None,
        "subcategory": category_name,
        "severity": severity,
        "priority": priority,
        "department": DEPARTMENTS.get(category_name, "Municipal Services"),
        "confidence": round(confidence, 4),
        "model": model_name,
        "explanation": "Category inferred from complaint text; severity is a rules-based triage estimate.",
    }


def duplicate_score(incoming: str, category_id: object, area: str | None, db: Session, exclude_id: object | None = None) -> tuple[float, list[Complaint]]:
    query = select(Complaint).where(Complaint.created_at >= datetime.now(timezone.utc) - timedelta(days=180))
    if exclude_id:
        query = query.where(Complaint.id != exclude_id)
    candidates = list(db.scalars(query.order_by(Complaint.created_at.desc()).limit(500)))
    incoming_norm = re.sub(r"\W+", " ", incoming.lower()).strip()
    ranked: list[tuple[float, Complaint]] = []
    for complaint in candidates:
        existing = f"{complaint.title} {complaint.description}".lower()
        text_score = SequenceMatcher(None, incoming_norm, re.sub(r"\W+", " ", existing).strip()).ratio()
        category_score = 1.0 if complaint.category_id == category_id else 0.0
        area_score = 1.0 if area and complaint.area and area.casefold() == complaint.area.casefold() else 0.0
        score = 0.7 * text_score + 0.2 * category_score + 0.1 * area_score
        if score >= 0.35:
            ranked.append((score, complaint))
    ranked.sort(key=lambda item: item[0], reverse=True)
    top = ranked[:5]
    return (top[0][0] if top else 0.0), [complaint for _, complaint in top]


def prediction_for_area(area: str, complaints: list[Complaint]) -> dict[str, object]:
    matching = [item for item in complaints if (item.area or item.ward or "Unknown").casefold() == area.casefold()]
    unresolved = sum(item.status != "RESOLVED" for item in matching)
    critical = sum(item.severity == "CRITICAL" for item in matching)
    now = datetime.now(timezone.utc)
    recent = sum((now - item.created_at).days <= 7 for item in matching)
    previous_week = sum(7 < (now - item.created_at).days <= 14 for item in matching)
    growth = max(0, recent - previous_week)
    resolution_rate = (len(matching) - unresolved) / len(matching) if matching else 0
    score = min(100, unresolved * 5 + critical * 12 + recent * 3 + growth * 4 - round(resolution_rate * 15))
    level = "CRITICAL" if score >= 80 else "HIGH" if score >= 55 else "MODERATE" if score >= 25 else "LOW"
    category = Counter(item.category.name if item.category else "Other" for item in matching).most_common(1)
    issue = category[0][0] if category else "civic issue"
    action = "Prioritize an urgent field inspection." if level in {"CRITICAL", "HIGH"} else "Continue monitoring actual complaint trends."
    return {
        "area": area,
        "predicted_issue": issue,
        "risk_score": score,
        "risk_level": level,
        "recommended_action": action,
        "confidence": round(min(0.9, 0.35 + len(matching) * 0.03), 2),
        "trend": "INCREASING" if recent > previous_week else "STABLE" if recent == previous_week else "DECREASING",
        "recent_7_day_count": recent,
        "previous_7_day_count": previous_week,
        "unresolved_count": unresolved,
        "resolution_rate": round(resolution_rate, 3),
        "label": "AI-estimated risk",
        "complaint_count": len(matching),
    }
