import datetime
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, Integer
from sqlalchemy.orm import relationship
from .database import Base

class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, index=True)
    status = Column(String, default="PENDING")  # PENDING, PROCESSING, COMPLETED, FAILED
    template_name = Column(String, nullable=False)
    spreadsheet_name = Column(String, nullable=False)
    template_path = Column(String, nullable=False)
    spreadsheet_path = Column(String, nullable=False)
    result_path = Column(String, nullable=True)
    error_message = Column(String, nullable=True)
    
    # Store schema configurations
    mapping_config = Column(JSON, nullable=True)
    insights_data = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    downloads = relationship("DownloadHistory", back_populates="job", cascade="all, delete-orphan")


class DownloadHistory(Base):
    __tablename__ = "download_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    downloaded_at = Column(DateTime, default=datetime.datetime.utcnow)

    job = relationship("Job", back_populates="downloads")
