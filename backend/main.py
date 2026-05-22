from fastapi import FastAPI, Depends, HTTPException, status, Query, Request, UploadFile, File
from pydantic import ValidationError
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_, text as sql_text
from typing import List, Optional
from datetime import datetime
import os
import uuid
import shutil
import re
import imghdr

import models
import schemas
from database import engine, get_db

# Create database tables
models.Base.metadata.create_all(bind=engine)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"jpeg": ".jpg", "png": ".png", "gif": ".gif", "webp": ".webp"}


def run_safe_migrations():
    """Apply additive SQLite migrations without deleting existing data."""
    with engine.begin() as conn:
        columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(issues)").fetchall()}
        if "assigned_to" not in columns:
            conn.execute(sql_text("ALTER TABLE issues ADD COLUMN assigned_to VARCHAR"))
        if "branch" not in columns:
            conn.execute(sql_text("ALTER TABLE issues ADD COLUMN branch VARCHAR"))
        if "repo_slug" not in columns:
            conn.execute(sql_text("ALTER TABLE issues ADD COLUMN repo_slug VARCHAR"))
        if "acceptance_criteria" not in columns:
            conn.execute(sql_text("ALTER TABLE issues ADD COLUMN acceptance_criteria TEXT"))
        if "updated_at" not in columns:
            conn.execute(sql_text("ALTER TABLE issues ADD COLUMN updated_at DATETIME"))
            conn.execute(sql_text("UPDATE issues SET updated_at = created_at WHERE updated_at IS NULL"))
        if "story_points" not in columns:
            conn.execute(sql_text("ALTER TABLE issues ADD COLUMN story_points INTEGER"))
        if "blocked_reason" not in columns:
            conn.execute(sql_text("ALTER TABLE issues ADD COLUMN blocked_reason TEXT"))

        image_columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(issue_images)").fetchall()}
        if "comment_id" not in image_columns:
            conn.execute(sql_text("ALTER TABLE issue_images ADD COLUMN comment_id INTEGER"))
        if "source_type" not in image_columns:
            conn.execute(sql_text("ALTER TABLE issue_images ADD COLUMN source_type VARCHAR DEFAULT 'issue'"))
        if "uploaded_by" not in image_columns:
            conn.execute(sql_text("ALTER TABLE issue_images ADD COLUMN uploaded_by VARCHAR"))

        table_names = {row[0] for row in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        if "issue_activity" not in table_names:
            conn.execute(sql_text("""
                CREATE TABLE issue_activity (
                    id INTEGER PRIMARY KEY,
                    issue_id INTEGER NOT NULL,
                    event_type VARCHAR NOT NULL,
                    field_name VARCHAR,
                    old_value TEXT,
                    new_value TEXT,
                    actor VARCHAR,
                    created_at DATETIME,
                    FOREIGN KEY(issue_id) REFERENCES issues (id)
                )
            """))
            conn.execute(sql_text("CREATE INDEX IF NOT EXISTS ix_issue_activity_issue_id ON issue_activity (issue_id)"))


run_safe_migrations()


def cleanup_priority_column_if_present():
    with engine.begin() as conn:
        columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(issues)").fetchall()}
        if "priority" not in columns:
            return
        conn.execute(sql_text("""
            CREATE TABLE IF NOT EXISTS issues_new (
                id INTEGER PRIMARY KEY,
                title VARCHAR,
                description TEXT,
                status VARCHAR,
                sprint_id INTEGER,
                created_at DATETIME,
                created_by VARCHAR,
                assigned_to VARCHAR,
                branch VARCHAR,
                acceptance_criteria TEXT,
                updated_at DATETIME,
                story_points INTEGER,
                blocked_reason TEXT,
                repo_slug VARCHAR,
                FOREIGN KEY(sprint_id) REFERENCES sprints (id)
            )
        """))
        conn.execute(sql_text("""
            INSERT INTO issues_new (id, title, description, status, sprint_id, created_at, created_by, assigned_to, branch, acceptance_criteria, updated_at, story_points, blocked_reason, repo_slug)
            SELECT id, title, description, status, sprint_id, created_at, created_by, assigned_to, branch, acceptance_criteria, updated_at, story_points, blocked_reason, repo_slug
            FROM issues
        """))
        conn.execute(sql_text("DROP TABLE issues"))
        conn.execute(sql_text("ALTER TABLE issues_new RENAME TO issues"))
        conn.execute(sql_text("CREATE INDEX IF NOT EXISTS ix_issues_id ON issues (id)"))
        conn.execute(sql_text("CREATE INDEX IF NOT EXISTS ix_issues_title ON issues (title)"))


cleanup_priority_column_if_present()

CANONICAL_TM_USERS = ["Dwight", "Jerry", "Resi", "Druck", "Aaron", "Taylor"]
LOGIN_ALLOWED_USERS = CANONICAL_TM_USERS.copy()
USERNAME_ALIASES = {
    "claw": "Jerry",
    "aaron": "Aaron",
    "taylor": "Taylor",
}


def canonicalize_username(value: Optional[str]) -> Optional[str]:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return None
    alias_key = normalized.lower()
    if alias_key in USERNAME_ALIASES:
        return USERNAME_ALIASES[alias_key]
    for candidate in CANONICAL_TM_USERS:
        if alias_key == candidate.lower():
            return candidate
    return normalized


def validate_tm_user(value: Optional[str], *, field_name: str, allow_blank: bool = False, allowed_users: Optional[List[str]] = None) -> Optional[str]:
    canonical = canonicalize_username(value)
    if canonical is None:
        if allow_blank:
            return None
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    permitted = allowed_users or CANONICAL_TM_USERS
    if canonical not in permitted:
        allowed = ", ".join(permitted)
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}. Allowed: {allowed}")
    return canonical


def rewrite_historical_usernames(db: Session):
    replacements = {
        "Claw": "Jerry",
        "claw": "Jerry",
        "aaron": "Aaron",
        "taylor": "Taylor",
    }
    for old, new in replacements.items():
        if old == new:
            continue
        db.query(models.Issue).filter(models.Issue.created_by == old).update({models.Issue.created_by: new}, synchronize_session=False)
        db.query(models.Issue).filter(models.Issue.assigned_to == old).update({models.Issue.assigned_to: new}, synchronize_session=False)
        db.query(models.Comment).filter(models.Comment.username == old).update({models.Comment.username: new}, synchronize_session=False)
        db.query(models.IssueImage).filter(models.IssueImage.uploaded_by == old).update({models.IssueImage.uploaded_by: new}, synchronize_session=False)
        db.query(models.IssueActivity).filter(models.IssueActivity.actor == old).update({models.IssueActivity.actor: new}, synchronize_session=False)

    existing_users = {user.username: user for user in db.query(models.User).all()}
    keep = set(CANONICAL_TM_USERS)
    for username in keep:
        if username not in existing_users:
            db.add(models.User(username=username, created_at=datetime.now()))

    db.flush()
    for removable in ["telegram", "aaron", "taylor", "Claw", "claw"]:
        user = db.query(models.User).filter(models.User.username == removable).first()
        if user:
            db.delete(user)


def normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def normalize_status(value: Optional[str]) -> str:
    status_value = (value or "to_do").strip().lower()
    if status_value not in models.STATUS_OPTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {', '.join(sorted(models.STATUS_OPTIONS))}")
    return status_value


def validate_story_points(value: Optional[int]) -> Optional[int]:
    if value is None:
        return None
    if value < 1 or value > 21:
        raise HTTPException(status_code=400, detail="story_points must be between 1 and 21")
    return value


def parse_issue_create_form(form) -> schemas.IssueCreate:
    payload = {
        "title": form.get("title"),
        "description": form.get("description"),
        "created_by": form.get("created_by"),
        "assigned_to": form.get("assigned_to") or None,
        "acceptance_criteria": form.get("acceptance_criteria") or None,
        "blocked_reason": form.get("blocked_reason") or None,
        "branch": form.get("branch") or None,
        "repo_slug": form.get("repo_slug") or None,
        "story_points": int(form.get("story_points")) if form.get("story_points") not in (None, "") else None,
        "sprint_id": int(form.get("sprint_id")) if form.get("sprint_id") not in (None, "") else None,
    }
    try:
        return schemas.IssueCreate(**payload)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def log_issue_activity(db: Session, issue_id: int, event_type: str, actor: Optional[str] = None, field_name: Optional[str] = None, old_value: Optional[object] = None, new_value: Optional[object] = None):
    activity = models.IssueActivity(
        issue_id=issue_id,
        event_type=event_type,
        actor=actor,
        field_name=field_name,
        old_value=None if old_value is None else str(old_value),
        new_value=None if new_value is None else str(new_value),
        created_at=datetime.now(),
    )
    db.add(activity)


def resolve_sprint_name(db: Session, sprint_id: Optional[int]) -> str:
    if sprint_id is None:
        return "Backlog"
    sprint = db.query(models.Sprint).filter(models.Sprint.id == sprint_id).first()
    return sprint.name if sprint else f"Sprint {sprint_id}"

app = FastAPI(title="Task Manager")

# CORS middleware to allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes

@app.post("/api/users/login", response_model=schemas.UserResponse)
def login(user: schemas.UserCreate, db: Session = Depends(get_db)):
    """Login approved Task Manager developers only, while preserving canonical user identities."""
    username = validate_tm_user(user.username, field_name="username", allowed_users=LOGIN_ALLOWED_USERS)
    rewrite_historical_usernames(db)
    db_user = db.query(models.User).filter(models.User.username == username).first()
    if not db_user:
        db_user = models.User(username=username)
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    else:
        db.commit()
    return db_user

@app.get("/api/users/current")
def get_current_user(username: str, db: Session = Depends(get_db)):
    """Get current user info"""
    username = validate_tm_user(username, field_name="username")
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.get("/api/users", response_model=List[schemas.UserResponse])
def list_users(db: Session = Depends(get_db)):
    """List canonical Task Manager users only"""
    rewrite_historical_usernames(db)
    db.commit()
    return db.query(models.User).filter(models.User.username.in_(CANONICAL_TM_USERS)).order_by(models.User.username).all()

@app.post("/api/issues", response_model=schemas.IssueResponse, status_code=status.HTTP_201_CREATED)
async def create_issue(request: Request, db: Session = Depends(get_db)):
    """Create a new issue"""
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        issue = schemas.IssueCreate(**(await request.json()))
    elif "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        issue = parse_issue_create_form(await request.form())
    else:
        raise HTTPException(status_code=415, detail="Unsupported content type")

    target_sprint_id = issue.sprint_id
    if target_sprint_id is None:
        active_sprint = db.query(models.Sprint).filter(models.Sprint.is_active == True).first()
        if active_sprint:
            target_sprint_id = active_sprint.id
    else:
        sprint = db.query(models.Sprint).filter(models.Sprint.id == target_sprint_id).first()
        if not sprint:
            raise HTTPException(status_code=404, detail="Sprint not found")

    created_by = validate_tm_user(issue.created_by, field_name="created_by")
    assigned_to = validate_tm_user(issue.assigned_to, field_name="assigned_to", allow_blank=True)

    db_issue = models.Issue(
        title=issue.title,
        description=issue.description,
        acceptance_criteria=normalize_optional_text(issue.acceptance_criteria),
        created_by=created_by,
        assigned_to=assigned_to,
        sprint_id=target_sprint_id,
        branch=normalize_optional_text(issue.branch),
        repo_slug=normalize_optional_text(issue.repo_slug),
        story_points=validate_story_points(issue.story_points),
        blocked_reason=normalize_optional_text(issue.blocked_reason),
        status="blocked" if normalize_optional_text(issue.blocked_reason) else "to_do",
        updated_at=datetime.now(),
    )
    db.add(db_issue)
    db.flush()
    log_issue_activity(db, db_issue.id, "created", actor=created_by, new_value=db_issue.title)
    db.commit()
    db.refresh(db_issue)
    return db_issue

@app.get("/api/issues", response_model=List[schemas.IssueResponse])
def get_issues(sprint_id: int = None, in_backlog: bool = False, db: Session = Depends(get_db)):
    """Get all issues, optionally filtered by sprint or backlog"""
    query = db.query(models.Issue)
    
    if in_backlog:
        query = query.filter(models.Issue.sprint_id == None)
    elif sprint_id is not None:
        query = query.filter(models.Issue.sprint_id == sprint_id)
    
    return query.order_by(models.Issue.created_at.desc()).all()

@app.get("/api/issues/search", response_model=List[schemas.IssueResponse])
def search_issues(
    q: str = "",
    search_in: str = Query("all", description="Where to search: all, title, description, comments"),
    status_filter: Optional[str] = Query(None, alias="status"),
    sprint_id: Optional[int] = None,
    created_by: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    assigned_to: Optional[str] = None,
    min_story_points: Optional[int] = None,
    max_story_points: Optional[int] = None,
    blocked_only: bool = False,
    needs_review: bool = False,
    stale_days: Optional[int] = None,
    in_backlog: bool = False,
    db: Session = Depends(get_db),
):
    """Search issues with filters across title, description, comments, or exact issue ID."""
    query = db.query(models.Issue)

    # --- search term handling ---
    normalized_q = q.strip()
    issue_id_query: Optional[int] = None
    if normalized_q:
        id_candidate = normalized_q[1:] if normalized_q.startswith("#") else normalized_q
        if id_candidate.isdigit():
            issue_id_query = int(id_candidate)

    # --- exact issue number search ---
    if issue_id_query is not None:
        query = query.filter(models.Issue.id == issue_id_query)

    # --- text search ---
    elif normalized_q:
        term = f"%{normalized_q}%"
        if search_in == "title":
            query = query.filter(models.Issue.title.ilike(term))
        elif search_in == "description":
            query = query.filter(models.Issue.description.ilike(term))
        elif search_in == "comments":
            query = query.join(models.Comment).filter(models.Comment.content.ilike(term))
        else:  # "all"
            query = query.outerjoin(models.Comment).filter(
                or_(
                    models.Issue.title.ilike(term),
                    models.Issue.description.ilike(term),
                    models.Comment.content.ilike(term),
                )
            )
            # deduplicate after outer join
            query = query.distinct()

    # --- filters ---
    if status_filter:
        query = query.filter(models.Issue.status == status_filter)

    if sprint_id is not None:
        query = query.filter(models.Issue.sprint_id == sprint_id)

    if in_backlog:
        query = query.filter(models.Issue.sprint_id == None)

    if created_by:
        query = query.filter(models.Issue.created_by == validate_tm_user(created_by, field_name="created_by"))

    if assigned_to:
        query = query.filter(models.Issue.assigned_to == validate_tm_user(assigned_to, field_name="assigned_to"))

    if min_story_points is not None:
        query = query.filter(models.Issue.story_points >= min_story_points)

    if max_story_points is not None:
        query = query.filter(models.Issue.story_points <= max_story_points)

    if blocked_only:
        query = query.filter(or_(models.Issue.status == "blocked", models.Issue.blocked_reason.isnot(None)))

    if needs_review:
        query = query.filter(models.Issue.status == "in_review")

    if stale_days is not None and stale_days >= 0:
        cutoff = datetime.now().timestamp() - (stale_days * 86400)
        query = query.filter(models.Issue.updated_at.is_not(None))
        query = query.filter(models.Issue.updated_at <= datetime.fromtimestamp(cutoff))

    if date_from:
        try:
            dt = datetime.fromisoformat(date_from)
            query = query.filter(models.Issue.created_at >= dt)
        except ValueError:
            pass

    if date_to:
        try:
            dt = datetime.fromisoformat(date_to)
            query = query.filter(models.Issue.created_at <= dt)
        except ValueError:
            pass

    return query.order_by(models.Issue.created_at.desc()).all()


@app.get("/api/issues/{issue_id}", response_model=schemas.IssueResponse)
def get_issue(issue_id: int, db: Session = Depends(get_db)):
    """Get a specific issue by ID"""
    issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return issue

@app.patch("/api/issues/{issue_id}", response_model=schemas.IssueResponse)
def update_issue(issue_id: int, issue_update: schemas.IssueUpdate, db: Session = Depends(get_db)):
    """Update an issue"""
    db_issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not db_issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    update_data = issue_update.dict(exclude_unset=True)
    actor = validate_tm_user(update_data.pop("updated_by", None), field_name="updated_by", allow_blank=True)

    normalized_updates = {}
    for field, value in update_data.items():
        if field in {"branch", "repo_slug", "acceptance_criteria", "blocked_reason"}:
            value = normalize_optional_text(value)
        elif field == "assigned_to":
            value = validate_tm_user(value, field_name="assigned_to", allow_blank=True)
        elif field == "status":
            value = normalize_status(value)
        if field == "story_points":
            value = validate_story_points(value)
        normalized_updates[field] = value

    if "sprint_id" in normalized_updates and normalized_updates["sprint_id"] is not None:
        sprint = db.query(models.Sprint).filter(models.Sprint.id == normalized_updates["sprint_id"]).first()
        if not sprint:
            raise HTTPException(status_code=404, detail="Sprint not found")

    if normalized_updates.get("blocked_reason") and "status" not in normalized_updates:
        normalized_updates["status"] = "blocked"
    elif "blocked_reason" in normalized_updates and not normalized_updates.get("blocked_reason") and db_issue.status == "blocked" and "status" not in normalized_updates:
        normalized_updates["status"] = "to_do"

    changed = False
    for field, value in normalized_updates.items():
        old_value = getattr(db_issue, field)
        if old_value != value:
            changed = True
            setattr(db_issue, field, value)
            if field == "sprint_id":
                log_issue_activity(db, issue_id, "field_changed", actor=actor, field_name=field, old_value=resolve_sprint_name(db, old_value), new_value=resolve_sprint_name(db, value))
            else:
                log_issue_activity(db, issue_id, "field_changed", actor=actor, field_name=field, old_value=old_value, new_value=value)

    if changed:
        db_issue.updated_at = datetime.now()

    db.commit()
    db.refresh(db_issue)
    return db_issue

@app.delete("/api/issues/{issue_id}")
def delete_issue(issue_id: int, db: Session = Depends(get_db)):
    """Delete an issue and its related records"""
    issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    uploads_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "uploads")
    for image in issue.images:
        file_path = os.path.join(uploads_dir, image.filename)
        if os.path.exists(file_path):
            os.remove(file_path)

    db.delete(issue)
    db.commit()
    return {"message": "Issue deleted successfully"}

@app.post("/api/issues/{issue_id}/comments", response_model=schemas.CommentResponse)
def add_comment(issue_id: int, comment: schemas.CommentCreate, db: Session = Depends(get_db)):
    """Add a comment to an issue"""
    issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    comment_username = validate_tm_user(comment.username, field_name="username")
    db_comment = models.Comment(
        content=comment.content,
        username=comment_username,
        issue_id=issue_id
    )
    db.add(db_comment)
    db.flush()
    log_issue_activity(db, issue_id, "comment_added", actor=comment_username, new_value=comment.content[:120])
    db.commit()
    db.refresh(db_comment)
    return db_comment

@app.post("/api/issues/{issue_id}/images", response_model=schemas.IssueImageResponse)
async def upload_image(
    issue_id: int,
    source_type: str = Query("issue", description="issue, description, or comment"),
    comment_id: Optional[int] = Query(None),
    uploaded_by: Optional[str] = Query(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload an image for an issue"""
    issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    normalized_source = source_type.strip().lower()
    if normalized_source not in {"issue", "description", "comment"}:
        raise HTTPException(status_code=400, detail="Invalid source_type. Allowed: issue, description, comment")

    if normalized_source == "comment":
        if comment_id is None:
            raise HTTPException(status_code=400, detail="comment_id is required when source_type=comment")
        comment = db.query(models.Comment).filter(
            models.Comment.id == comment_id,
            models.Comment.issue_id == issue_id,
        ).first()
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found for this issue")
    else:
        comment_id = None
    
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file upload")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Max 10 MB")

    detected_type = imghdr.what(None, h=file_bytes)
    if detected_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid image content. Allowed: jpg, png, gif, webp")

    original_ext = os.path.splitext(file.filename or "")[1].lower()
    normalized_ext = ALLOWED_IMAGE_TYPES[detected_type]
    if original_ext and original_ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        raise HTTPException(status_code=400, detail="Invalid file extension. Allowed: jpg, jpeg, png, gif, webp")

    uploads_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "uploads")
    os.makedirs(uploads_path, exist_ok=True)

    unique_filename = f"{uuid.uuid4()}{normalized_ext}"
    file_path = os.path.join(uploads_path, unique_filename)

    with open(file_path, "wb") as buffer:
        buffer.write(file_bytes)
    
    uploaded_by = validate_tm_user(uploaded_by, field_name="uploaded_by", allow_blank=True)

    # Create database record
    db_image = models.IssueImage(
        issue_id=issue_id,
        comment_id=comment_id,
        filename=unique_filename,
        source_type=normalized_source,
        uploaded_by=uploaded_by,
    )
    db.add(db_image)
    db.commit()
    db.refresh(db_image)
    
    return db_image

@app.delete("/api/issues/{issue_id}/images/{image_id}")
def delete_image(issue_id: int, image_id: int, db: Session = Depends(get_db)):
    """Delete an image from an issue"""
    image = db.query(models.IssueImage).filter(
        models.IssueImage.id == image_id,
        models.IssueImage.issue_id == issue_id
    ).first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Delete file from filesystem
    file_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "uploads", image.filename)
    if os.path.exists(file_path):
        os.remove(file_path)
    
    # Delete database record
    db.delete(image)
    db.commit()
    
    return {"message": "Image deleted successfully"}

@app.post("/api/sprints", response_model=schemas.SprintResponse)
def create_sprint(sprint: schemas.SprintCreate, db: Session = Depends(get_db)):
    """Create a new sprint"""
    db_sprint = models.Sprint(name=sprint.name, is_active=False)
    db.add(db_sprint)
    db.commit()
    db.refresh(db_sprint)
    return db_sprint

@app.get("/api/sprints", response_model=List[schemas.SprintResponse])
def get_sprints(active_only: bool = False, db: Session = Depends(get_db)):
    """Get all sprints"""
    query = db.query(models.Sprint)
    if active_only:
        query = query.filter(models.Sprint.is_active == True)
    return query.order_by(models.Sprint.id.desc()).all()

@app.get("/api/sprints/active", response_model=schemas.SprintResponse)
def get_active_sprint(db: Session = Depends(get_db)):
    """Get the currently active sprint"""
    sprint = db.query(models.Sprint).filter(models.Sprint.is_active == True).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="No active sprint")
    return sprint

@app.get("/api/sprints/{sprint_id}", response_model=schemas.SprintResponse)
def get_sprint(sprint_id: int, db: Session = Depends(get_db)):
    """Get a specific sprint by ID"""
    sprint = db.query(models.Sprint).filter(models.Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    return sprint

@app.post("/api/sprints/{sprint_id}/start")
def start_sprint(sprint_id: int, db: Session = Depends(get_db)):
    """Start a sprint"""
    # End any currently active sprints
    active_sprints = db.query(models.Sprint).filter(models.Sprint.is_active == True).all()
    for sprint in active_sprints:
        sprint.is_active = False
        sprint.ended_at = datetime.now()
    
    # Start the new sprint
    sprint = db.query(models.Sprint).filter(models.Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    
    sprint.is_active = True
    sprint.started_at = datetime.now()
    db.commit()
    return {"message": "Sprint started", "sprint_id": sprint_id}

@app.post("/api/sprints/{sprint_id}/end")
def end_sprint(sprint_id: int, db: Session = Depends(get_db)):
    """End a sprint without moving its issues to backlog."""
    sprint = db.query(models.Sprint).filter(models.Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    issue_count = db.query(models.Issue).filter(models.Issue.sprint_id == sprint_id).count()
    sprint.is_active = False
    sprint.ended_at = datetime.now()
    db.commit()
    return {"message": "Sprint ended", "issues_retained": issue_count, "sprint_id": sprint_id}

@app.post("/api/issues/{issue_id}/assign-to-sprint")
def assign_to_sprint(issue_id: int, sprint_id: int, db: Session = Depends(get_db)):
    """Assign an issue to a sprint without rewriting its status."""
    issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    sprint = db.query(models.Sprint).filter(models.Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    old_sprint_id = issue.sprint_id
    issue.sprint_id = sprint_id
    issue.updated_at = datetime.now()
    if old_sprint_id != sprint_id:
        log_issue_activity(db, issue_id, "field_changed", field_name="sprint_id", old_value=resolve_sprint_name(db, old_sprint_id), new_value=resolve_sprint_name(db, sprint_id))
    db.commit()
    return {"message": "Issue assigned to sprint", "sprint_id": sprint_id, "issue_id": issue_id, "status": issue.status}

# Serve static files
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

    # Serve root-level Apple touch icons so Safari's automatic requests don't 404
    @app.get("/apple-touch-icon.png")
    @app.get("/apple-touch-icon-120x120.png")
    @app.get("/apple-touch-icon-152x152.png")
    @app.get("/apple-touch-icon-167x167.png")
    @app.get("/apple-touch-icon-180x180.png")
    @app.get("/apple-touch-icon-120x120-precomposed.png")
    def _apple_touch_icon(request: Request):
        filename = request.url.path.lstrip("/")
        file_path = os.path.join(os.path.dirname(__file__), "..", "frontend", filename)
        if os.path.exists(file_path):
            return FileResponse(file_path)
        raise HTTPException(status_code=404, detail="Icon not found")

@app.get("/")
def read_root():
    """Serve the configured landing page for this service instance."""
    app_home = os.getenv("APP_HOME", "legacy").strip().lower()
    landing = "factory-login.html" if app_home == "factory" else "index.html"
    frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend", landing)
    if os.path.exists(frontend_path):
        return FileResponse(frontend_path)
    return {"message": "Task Manager API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
