from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    # For postgresql, we don't need connect_args={"check_same_thread": False} which is sqlite specific,
    # but we can configure connection pool settings if needed.
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to get db session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
