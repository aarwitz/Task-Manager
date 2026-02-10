from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import os

import models
import schemas
from database import engine, get_db

# Create database tables
models.Base.metadata.create_all(bind=engine)

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
    """Login or create user if doesn't exist"""
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if not db_user:
        db_user = models.User(username=user.username)
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    return db_user

@app.get("/api/users/current")
def get_current_user(username: str, db: Session = Depends(get_db)):
    """Get current user info"""
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.post("/api/issues", response_model=schemas.IssueResponse, status_code=status.HTTP_201_CREATED)
def create_issue(issue: schemas.IssueCreate, db: Session = Depends(get_db)):
    """Create a new issue"""
    db_issue = models.Issue(
        title=issue.title,
        description=issue.description,
        created_by=issue.created_by,
        status="to_do"
    )
    db.add(db_issue)
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
    for field, value in update_data.items():
        setattr(db_issue, field, value)
    
    db.commit()
    db.refresh(db_issue)
    return db_issue

@app.post("/api/issues/{issue_id}/comments", response_model=schemas.CommentResponse)
def add_comment(issue_id: int, comment: schemas.CommentCreate, db: Session = Depends(get_db)):
    """Add a comment to an issue"""
    issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    db_comment = models.Comment(
        content=comment.content,
        username=comment.username,
        issue_id=issue_id
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    return db_comment

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

@app.post("/api/sprints/{sprint_id}/start")
def start_sprint(sprint_id: int, db: Session = Depends(get_db)):
    """Start a sprint"""
    # End any currently active sprints
    active_sprints = db.query(models.Sprint).filter(models.Sprint.is_active == True).all()
    for sprint in active_sprints:
        sprint.is_active = False
        sprint.ended_at = datetime.utcnow()
    
    # Start the new sprint
    sprint = db.query(models.Sprint).filter(models.Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    
    sprint.is_active = True
    sprint.started_at = datetime.utcnow()
    db.commit()
    return {"message": "Sprint started", "sprint_id": sprint_id}

@app.post("/api/sprints/{sprint_id}/end")
def end_sprint(sprint_id: int, db: Session = Depends(get_db)):
    """End a sprint and move all issues back to backlog"""
    sprint = db.query(models.Sprint).filter(models.Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    
    # Move all issues back to backlog
    issues = db.query(models.Issue).filter(models.Issue.sprint_id == sprint_id).all()
    for issue in issues:
        issue.sprint_id = None
    
    sprint.is_active = False
    sprint.ended_at = datetime.utcnow()
    db.commit()
    return {"message": "Sprint ended", "issues_moved": len(issues)}

@app.post("/api/issues/{issue_id}/assign-to-sprint")
def assign_to_sprint(issue_id: int, sprint_id: int, db: Session = Depends(get_db)):
    """Assign an issue to a sprint"""
    issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    sprint = db.query(models.Sprint).filter(models.Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    
    issue.sprint_id = sprint_id
    issue.status = "to_do"  # Reset to "to_do" when assigned to sprint
    db.commit()
    return {"message": "Issue assigned to sprint"}

# Serve static files
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

@app.get("/")
def read_root():
    """Serve the main page"""
    frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "index.html")
    if os.path.exists(frontend_path):
        return FileResponse(frontend_path)
    return {"message": "Task Manager API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
