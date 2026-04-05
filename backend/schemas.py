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

class IssueUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    sprint_id: Optional[int] = None
    assigned_to: Optional[str] = None

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

class IssueResponse(BaseModel):
    id: int
    title: str
    description: str
    status: str
    sprint_id: Optional[int]
    created_at: datetime
    created_by: str
    assigned_to: Optional[str] = None
    comments: List[CommentResponse] = []
    images: List[IssueImageResponse] = []
    
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
