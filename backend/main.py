import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .api import upload, generate

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("main")

# Create database tables
try:
    Base.metadata.create_all(bind=engine)
    logger.info("Successfully synchronized database schema.")
except Exception as e:
    logger.error(f"Database table synchronization failed: {e}")

app = FastAPI(
    title="AI PowerPoint Builder API",
    description="Asynchronously maps datasets to slide templates and populates business decks with native charts.",
    version="1.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production environments
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(upload.router)
app.include_router(generate.router)

@app.get("/api/health")
async def health_check():
    """Service health indicator."""
    return {"status": "healthy", "service": "AI PowerPoint Builder Backend"}
