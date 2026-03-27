from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

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
    status = Column(String, default="to_do")  # to_do, in_progress, in_review, done
    sprint_id = Column(Integer, ForeignKey("sprints.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    created_by = Column(String)
    assigned_to = Column(String, nullable=True)
    
    comments = relationship("Comment", back_populates="issue", cascade="all, delete-orphan")
    images = relationship("IssueImage", back_populates="issue", cascade="all, delete-orphan")
    sprint = relationship("Sprint", back_populates="issues")

class Comment(Base):
    __tablename__ = "comments"
    
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text)
    issue_id = Column(Integer, ForeignKey("issues.id"))
    username = Column(String)
    created_at = Column(DateTime, default=datetime.now)
    
    issue = relationship("Issue", back_populates="comments")

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
    filename = Column(String)
    uploaded_at = Column(DateTime, default=datetime.now)
    
    issue = relationship("Issue", back_populates="images")
