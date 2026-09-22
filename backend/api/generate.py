import os
import uuid
import logging
import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from ..config import UPLOAD_DIR, OUTPUT_DIR
from ..database import get_db
from ..models import Job, DownloadHistory
from ..schemas import JobCreate, JobResponse, DownloadHistoryResponse, JobCompile
from ..parsers.ppt_parser import parse_ppt_file
from ..parsers.excel_parser import parse_excel_file
from ..services.groq_service import GroqService
from ..agents.intent_agent import IntentAgent
from ..agents.mapping_agent import MappingAgent
from ..agents.insight_agent import InsightAgent
from ..agents.chart_agent import ChartAgent
from ..generators.ppt_generator import generate_presentation

router = APIRouter(prefix="/api/generate", tags=["Generation"])
logger = logging.getLogger("generate_api")

# We can run jobs asynchronously using BackgroundTasks or a custom thread/task manager
def run_ppt_generation_pipeline(job_id: str, db_session_factory):
    """
    Background worker pipeline executing the AI PPT Builder logic.
    """
    db: Session = db_session_factory()
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        logger.error(f"Job {job_id} not found in database for background execution.")
        db.close()
        return

    try:
        job.status = "PROCESSING"
        db.commit()

        # Step 1: Initialize services and agents
        groq_service = GroqService()
        intent_agent = IntentAgent(groq_service)
        mapping_agent = MappingAgent(groq_service)
        insight_agent = InsightAgent(groq_service)
        chart_agent = ChartAgent(groq_service)

        # Step 2: Parse Template & Dataset
        logger.info(f"[{job_id}] Parsing PowerPoint template...")
        ppt_structure = parse_ppt_file(job.template_path)
        
        logger.info(f"[{job_id}] Parsing Excel/CSV dataset...")
        excel_schema = parse_excel_file(job.spreadsheet_path)

        # Step 3: Classify Slide Intents
        logger.info(f"[{job_id}] Determining slide intents...")
        slides_with_intents = intent_agent.determine_intents(ppt_structure["slides"])

        # Step 4: Map Data Columns
        # Use user override mappings if provided, otherwise query mapping agent
        if job.mapping_config:
            logger.info(f"[{job_id}] Using user-provided mapping override...")
            slides_with_mappings = []
            user_mapping = job.mapping_config  # Format: {"slide_index": [columns]}
            for s in slides_with_intents:
                idx_str = str(s["slide_index"])
                s_copy = s.copy()
                s_copy["relevant_columns"] = user_mapping.get(idx_str, s_copy.get("relevant_columns", []))
                slides_with_mappings.append(s_copy)
        else:
            logger.info(f"[{job_id}] Running AI column mapping agent...")
            slides_with_mappings = mapping_agent.map_columns(slides_with_intents, excel_schema)
            # Store computed mapping configuration
            computed_mapping = {str(item["slide_index"]): item["relevant_columns"] for item in slides_with_mappings}
            job.mapping_config = computed_mapping
            db.commit()

        # Step 5: Generate Business Insights
        logger.info(f"[{job_id}] Generating business insights...")
        slides_with_insights = insight_agent.generate_insights(slides_with_mappings, excel_schema)

        # Step 6: Select and Configure Charts
        logger.info(f"[{job_id}] Selecting chart types and series...")
        slides_with_charts = chart_agent.determine_charts(slides_with_insights, excel_schema)
        
        # Save insights and chart configs to db for reference/preview
        job.insights_data = {"slides": slides_with_charts}
        job.status = "PLAN_GENERATED"
        logger.info(f"[{job_id}] AI suggestions plan generated successfully!")

    except Exception as e:
        logger.error(f"[{job_id}] Generation pipeline failed: {e}", exc_info=True)
        job.status = "FAILED"
        job.error_message = str(e)
    finally:
        db.commit()
        db.close()


def run_ppt_compilation_pipeline(job_id: str, db_session_factory):
    """
    Background worker pipeline executing Step 7 (PPT vector compilation).
    """
    db: Session = db_session_factory()
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        logger.error(f"Job {job_id} not found in database for background compilation.")
        db.close()
        return

    try:
        job.status = "PROCESSING"
        db.commit()

        # Step 7: Final Slide Compilation & PPT Export
        output_filename = f"generated_{job_id}_{job.template_name}"
        result_path = os.path.join(OUTPUT_DIR, output_filename)

        logger.info(f"[{job_id}] Rebuilding slides and drawing native charts...")
        generate_presentation(
            template_path=job.template_path,
            output_path=result_path,
            dataset_path=job.spreadsheet_path,
            slides_config=job.insights_data["slides"]
        )

        job.result_path = result_path
        job.status = "COMPLETED"
        logger.info(f"[{job_id}] Slide compilation completed successfully!")

    except Exception as e:
        logger.error(f"[{job_id}] Compilation pipeline failed: {e}", exc_info=True)
        job.status = "FAILED"
        job.error_message = str(e)
    finally:
        db.commit()
        db.close()


@router.post("", response_model=JobResponse)
async def start_job(payload: JobCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Initiates an asynchronous PowerPoint generation job."""
    # Find matching files in UPLOAD_DIR
    template_path = os.path.join(UPLOAD_DIR, payload.template_name)
    spreadsheet_path = os.path.join(UPLOAD_DIR, payload.spreadsheet_name)

    if not os.path.exists(template_path):
        raise HTTPException(status_code=404, detail=f"PPTX template file '{payload.template_name}' not found.")
    if not os.path.exists(spreadsheet_path):
        raise HTTPException(status_code=404, detail=f"Spreadsheet file '{payload.spreadsheet_name}' not found.")

    job_id = str(uuid.uuid4())
    
    # Save initial Job record
    new_job = Job(
        id=job_id,
        status="PENDING",
        template_name=os.path.basename(payload.template_name).split("_", 1)[-1],
        spreadsheet_name=os.path.basename(payload.spreadsheet_name).split("_", 1)[-1],
        template_path=template_path,
        spreadsheet_path=spreadsheet_path,
        mapping_config=payload.mapping_config
    )

    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    # Queue execution
    from ..database import SessionLocal
    background_tasks.add_task(run_ppt_generation_pipeline, job_id, SessionLocal)

    return new_job

@router.get("/job/{job_id}", response_model=JobResponse)
async def get_job_status(job_id: str, db: Session = Depends(get_db)):
    """Retrieves current job status and meta results."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job

@router.post("/job/{job_id}/compile", response_model=JobResponse)
async def compile_job(job_id: str, payload: JobCompile, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Triggers the slide vector compilation after the user edits slide configs."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    
    # Update job status and store finalized slide layout configs
    job.status = "PROCESSING"
    job.insights_data = {"slides": payload.slides_config}
    db.commit()

    # Queue compilation background task
    from ..database import SessionLocal
    background_tasks.add_task(run_ppt_compilation_pipeline, job.id, SessionLocal)

    return job

@router.get("/downloads", response_model=List[DownloadHistoryResponse])
async def get_download_history(db: Session = Depends(get_db)):
    """Lists completed downloads in historical order."""
    downloads = db.query(DownloadHistory).order_by(DownloadHistory.downloaded_at.desc()).all()
    return downloads

@router.get("/download/{job_id}")
async def download_presentation(job_id: str, db: Session = Depends(get_db)):
    """Downloads the generated presentation file and registers history."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    
    if job.status != "COMPLETED" or not job.result_path:
        raise HTTPException(status_code=400, detail=f"Presentation is not ready. Status: {job.status}")

    if not os.path.exists(job.result_path):
        raise HTTPException(status_code=404, detail="Generated file not found on disk.")

    # Save to history
    dl_entry = DownloadHistory(
        job_id=job.id,
        filename=job.template_name
    )
    db.add(dl_entry)
    db.commit()

    return FileResponse(
        path=job.result_path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=f"final_{job.template_name}"
    )
