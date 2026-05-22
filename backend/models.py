from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

STATUS_OPTIONS = {"to_do", "in_progress", "in_review", "done", "blocked"}
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.now)

class Issue(Base):
    __tablename__ = "issues"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(Text)
    acceptance_criteria = Column(Text, nullable=True)
    status = Column(String, default="to_do")  # to_do, in_progress, in_review, done, blocked
    sprint_id = Column(Integer, ForeignKey("sprints.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    created_by = Column(String)
    assigned_to = Column(String, nullable=True)
    branch = Column(String, nullable=True)
    repo_slug = Column(String, nullable=True)
    story_points = Column(Integer, nullable=True)
    blocked_reason = Column(Text, nullable=True)
    
    comments = relationship("Comment", back_populates="issue", cascade="all, delete-orphan")
    images = relationship("IssueImage", back_populates="issue", cascade="all, delete-orphan")
    sprint = relationship("Sprint", back_populates="issues")
    activity_events = relationship("IssueActivity", back_populates="issue", cascade="all, delete-orphan", order_by="desc(IssueActivity.created_at)")

class Comment(Base):
    __tablename__ = "comments"
    
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text)
    issue_id = Column(Integer, ForeignKey("issues.id"))
    username = Column(String)
    created_at = Column(DateTime, default=datetime.now)
    
    issue = relationship("Issue", back_populates="comments")
    images = relationship("IssueImage", back_populates="comment")

class Sprint(Base):
    __tablename__ = "sprints"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    is_active = Column(Boolean, default=False)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    
    issues = relationship("Issue", back_populates="sprint")

class IssueImage(Base):
    __tablename__ = "issue_images"
    
    id = Column(Integer, primary_key=True, index=True)
    issue_id = Column(Integer, ForeignKey("issues.id"))
    comment_id = Column(Integer, ForeignKey("comments.id"), nullable=True)
    filename = Column(String)
    source_type = Column(String, default="issue")
    uploaded_by = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.now)
    
    issue = relationship("Issue", back_populates="images")
    comment = relationship("Comment", back_populates="images")

class IssueActivity(Base):
    __tablename__ = "issue_activity"

    id = Column(Integer, primary_key=True, index=True)
    issue_id = Column(Integer, ForeignKey("issues.id"), nullable=False, index=True)
    event_type = Column(String, nullable=False)
    field_name = Column(String, nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    actor = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    issue = relationship("Issue", back_populates="activity_events")
