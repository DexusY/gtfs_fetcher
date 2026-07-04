from sqlalchemy import (
    Boolean, Column, Date, Integer, String, Text, Float, DateTime, ForeignKey, Index,
)
from db.database import Base


class GtfsRegions(Base):
    __tablename__ = "gtfs_regions"

    id                = Column(Integer, primary_key=True, index=True)
    name              = Column(String, nullable=False)
    country           = Column(String, nullable=True)
    city              = Column(String, nullable=True)
    static_url = Column(String, nullable=False)
    rt_url     = Column(String, nullable=True)


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    email         = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role          = Column(String, nullable=False, default="user")


class GtfsStops(Base):
    __tablename__ = "gtfs_stops"

    region_id = Column(Integer, ForeignKey("gtfs_regions.id", ondelete="CASCADE"), primary_key=True)
    stop_id   = Column(Text, primary_key=True)
    name      = Column(Text)
    lat       = Column(Float)
    lon       = Column(Float)


class GtfsRoutes(Base):
    __tablename__ = "gtfs_routes"

    region_id  = Column(Integer, ForeignKey("gtfs_regions.id", ondelete="CASCADE"), primary_key=True)
    route_id   = Column(Text, primary_key=True)
    short_name = Column(Text)


class GtfsTrips(Base):
    __tablename__ = "gtfs_trips"

    region_id  = Column(Integer, ForeignKey("gtfs_regions.id", ondelete="CASCADE"), primary_key=True)
    trip_id    = Column(Text, primary_key=True)
    route_id   = Column(Text)
    headsign   = Column(Text)
    shape_id   = Column(Text)
    service_id = Column(Text, nullable=False, default="", server_default="")


class GtfsStopTimes(Base):
    __tablename__ = "gtfs_stop_times"

    # PK-less heap table in the DB (loaded by COPY, queried by ix_stop_times_lookup).
    # (region_id, trip_id, seq) is the natural identity; declared here only so the
    # ORM can map rows — it is not enforced as a DB constraint.
    region_id = Column(Integer, primary_key=True)
    trip_id   = Column(Text, primary_key=True)
    seq       = Column(Integer, primary_key=True)
    stop_id   = Column(Text, nullable=False)
    dep_time  = Column(Text)

    __table_args__ = (Index("ix_stop_times_lookup", "region_id", "stop_id"),)


class GtfsShapes(Base):
    __tablename__ = "gtfs_shapes"

    # PK-less heap table; (region_id, shape_id, seq) is the natural identity.
    region_id = Column(Integer, primary_key=True)
    shape_id  = Column(Text, primary_key=True)
    seq       = Column(Integer, primary_key=True)
    lat       = Column(Float)
    lon       = Column(Float)

    __table_args__ = (Index("ix_shapes_region", "region_id", "shape_id", "seq"),)


class GtfsCalendar(Base):
    __tablename__ = "gtfs_calendar"

    region_id  = Column(Integer, ForeignKey("gtfs_regions.id", ondelete="CASCADE"), primary_key=True)
    service_id = Column(Text, primary_key=True)
    monday     = Column(Integer, nullable=False, default=0)
    tuesday    = Column(Integer, nullable=False, default=0)
    wednesday  = Column(Integer, nullable=False, default=0)
    thursday   = Column(Integer, nullable=False, default=0)
    friday     = Column(Integer, nullable=False, default=0)
    saturday   = Column(Integer, nullable=False, default=0)
    sunday     = Column(Integer, nullable=False, default=0)
    start_date = Column(Date, nullable=False)
    end_date   = Column(Date, nullable=False)


class GtfsCalendarDates(Base):
    __tablename__ = "gtfs_calendar_dates"

    region_id      = Column(Integer, ForeignKey("gtfs_regions.id", ondelete="CASCADE"), primary_key=True)
    service_id     = Column(Text, primary_key=True)
    date           = Column(Date, primary_key=True)
    exception_type = Column(Integer, nullable=False)   # 1 = added, 2 = removed


class GtfsIngest(Base):
    __tablename__ = "gtfs_ingest"

    region_id  = Column(Integer, ForeignKey("gtfs_regions.id", ondelete="CASCADE"), primary_key=True)
    status     = Column(Text, nullable=False)   # 'warming' | 'ready' | 'failed'
    loaded_at  = Column(DateTime(timezone=True))
    etag       = Column(Text)
    error      = Column(Text)
    has_shapes = Column(Boolean, nullable=False, default=False, server_default="false")
