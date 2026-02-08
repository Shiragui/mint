-- LENS_VAULT table for storing Lens Capture webhook data
-- Run this in your Snowflake worksheet before using the backend

CREATE TABLE IF NOT EXISTS LENS_VAULT (
    ID          VARCHAR(36) PRIMARY KEY,   -- UUID as string
    IMAGE       TEXT,                       -- Base64 image string (can be very long)
    LABEL       VARCHAR(1000),              -- AI-generated description
    METADATA    VARIANT,                    -- Flexible JSON metadata (timestamp, mimeType, etc.)
    CREATED_AT  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Optional: Create a staging database/schema if needed
-- CREATE DATABASE IF NOT EXISTS LENS_DB;
-- CREATE SCHEMA IF NOT EXISTS LENS_DB.LENS;
-- USE SCHEMA LENS_DB.LENS;
