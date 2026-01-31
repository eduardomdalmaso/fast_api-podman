from datetime import datetime  # Adicione esta linha
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Boolean,
    Text,
    DateTime,
    ForeignKey,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from config import DATABASE_URL

Base = declarative_base()
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String)
    active = Column(Boolean, default=True)
    page_permissions = Column(Text, default="[]")


class Camera(Base):
    __tablename__ = "cameras"
    platform = Column(String, primary_key=True)
    name = Column(String)
    url = Column(String)
    zones = Column(Text, default="{}")


class AccessLog(Base):
    __tablename__ = "access_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, nullable=True)
    username = Column(String)
    action = Column(String)
    details = Column(Text, nullable=True)
    ip = Column(String)


# Crie tabelas
Base.metadata.create_all(bind=engine)
