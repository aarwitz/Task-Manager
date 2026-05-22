from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class UserCreate(BaseModel):
    username: str

class UserResponse(BaseModel):
    id: int
    username: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class IssueCreate(BaseModel):
    title: str
    description: str
    created_by: str
    assigned_to: Optional[str] = None
    sprint_id: Optional[int] = None
    branch: Optional[str] = None
    repo_slug: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    story_points: Optional[int] = None
    priority: Optional[str] = "medium"
    blocked_reason: Optional[str] = None

class IssueUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    status: Optional[str] = None
    sprint_id: Optional[int] = None
    assigned_to: Optional[str] = None
    branch: Optional[str] = None
    repo_slug: Optional[str] = None
    story_points: Optional[int] = None
    priority: Optional[str] = None
    blocked_reason: Optional[str] = None
    updated_by: Optional[str] = None

class CommentCreate(BaseModel):
    content: str
    username: str

class IssueImageResponse(BaseModel):
    id: int
    filename: str
    issue_id: int
    comment_id: Optional[int] = None
    source_type: str
    uploaded_by: Optional[str] = None
    uploaded_at: datetime
    
    class Config:
        from_attributes = True

class CommentResponse(BaseModel):
    id: int
    content: str
    username: str
    created_at: datetime
    images: List[IssueImageResponse] = []
    
    class Config:
        from_attributes = True

class IssueActivityResponse(BaseModel):
    id: int
    event_type: str
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    actor: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class IssueResponse(BaseModel):
    id: int
    title: str
    description: str
    acceptance_criteria: Optional[str] = None
    status: str
    sprint_id: Optional[int]
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: str
    assigned_to: Optional[str] = None
    branch: Optional[str] = None
    repo_slug: Optional[str] = None
    story_points: Optional[int] = None
    priority: Optional[str] = None
    blocked_reason: Optional[str] = None
    comments: List[CommentResponse] = []
    images: List[IssueImageResponse] = []
    activity_events: List[IssueActivityResponse] = []
    
    class Config:
        from_attributes = True

class SprintCreate(BaseModel):
    name: str

class SprintResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    
    class Config:
        from_attributes = True
