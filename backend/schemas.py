from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class JobCreate(BaseModel):
    template_name: str
    spreadsheet_name: str
    mapping_config: Optional[Dict[str, Any]] = None

class JobResponse(BaseModel):
    id: str
    status: str
    template_name: str
    spreadsheet_name: str
    result_path: Optional[str] = None
    error_message: Optional[str] = None
    mapping_config: Optional[Dict[str, Any]] = None
    insights_data: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DownloadHistoryResponse(BaseModel):
    id: int
    job_id: str
    filename: str
    downloaded_at: datetime

    class Config:
        from_attributes = True

class SlideShapeInfo(BaseModel):
    index: int
    type: str
    text: Optional[str] = None

class SlideInfo(BaseModel):
    index: int
    title: Optional[str] = None
    layout_name: str
    placeholders: List[SlideShapeInfo]
    other_shapes: List[SlideShapeInfo]

class PPTParseResponse(BaseModel):
    saved_filename: str
    slides: List[SlideInfo]

class ExcelColumnInfo(BaseModel):
    name: str
    type: str
    sample_values: List[Any]
    stats: Dict[str, Any]

class ExcelParseResponse(BaseModel):
    saved_filename: str
    columns: List[ExcelColumnInfo]
    row_count: int

class JobCompile(BaseModel):
    slides_config: List[Dict[str, Any]]
