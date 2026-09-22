import os
import uuid
import shutil
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException
from ..config import UPLOAD_DIR
from ..parsers.ppt_parser import parse_ppt_file
from ..parsers.excel_parser import parse_excel_file
from ..schemas import PPTParseResponse, ExcelParseResponse

router = APIRouter(prefix="/api/upload", tags=["Upload"])
logger = logging.getLogger("upload_api")

@router.post("/ppt", response_model=PPTParseResponse)
async def upload_ppt(file: UploadFile = File(...)):
    """Uploads and parses a PPTX template file, returning layout structure."""
    if not file.filename.endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Only PowerPoint (.pptx) templates are supported.")

    file_id = str(uuid.uuid4())
    filename = f"{file_id}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Parse presentation
        parse_results = parse_ppt_file(file_path)
        parse_results["saved_filename"] = filename
        return parse_results
        
    except ValueError as val_err:
        if os.path.exists(file_path):
            os.remove(file_path)
        logger.error(f"Validation error parsing PPTX: {val_err}")
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        logger.error(f"Unexpected error uploading PPTX: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload and parse template: {e}")

@router.post("/excel", response_model=ExcelParseResponse)
async def upload_excel(file: UploadFile = File(...)):
    """Uploads and parses an Excel or CSV file, returning column details and stats."""
    if not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls") or file.filename.endswith(".csv")):
        raise HTTPException(status_code=400, detail="Only Excel (.xlsx, .xls) and CSV files are supported.")

    file_id = str(uuid.uuid4())
    filename = f"{file_id}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Parse spreadsheet
        parse_results = parse_excel_file(file_path)
        parse_results["saved_filename"] = filename
        return parse_results
        
    except ValueError as val_err:
        if os.path.exists(file_path):
            os.remove(file_path)
        logger.error(f"Validation error parsing Excel: {val_err}")
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        logger.error(f"Unexpected error uploading Excel: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload and parse dataset: {e}")
