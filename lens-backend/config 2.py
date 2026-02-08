"""
Configuration from environment variables.
"""
import os
from pathlib import Path

# Load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

from pathlib import Path
from typing import Optional


def _env(key: str, default: Optional[str] = None) -> Optional[str]:
    return os.environ.get(key, default)


# API (leave empty to skip API key check)
API_KEY = _env("LENS_API_KEY", "")
SECRET_KEY = _env("LENS_SECRET_KEY", "change-me-in-production")

# Login (demo users - in production use a DB)
# Format: LENS_USERS=user1:bcrypt_hash,user2:hash
# Or use env: LENS_ADMIN_USER, LENS_ADMIN_PASSWORD (plain, hashed at startup)
ADMIN_USER = _env("LENS_ADMIN_USER", "admin")
ADMIN_PASSWORD = _env("LENS_ADMIN_PASSWORD", "admin")  # In production use hashed

# Snowflake
SNOWFLAKE_ACCOUNT = _env("SNOWFLAKE_ACCOUNT")
SNOWFLAKE_USER = _env("SNOWFLAKE_USER")
SNOWFLAKE_PRIVATE_KEY_PATH = _env("SNOWFLAKE_PRIVATE_KEY_PATH", "rsa_key.p8")
SNOWFLAKE_PRIVATE_KEY = _env("SNOWFLAKE_PRIVATE_KEY")  # PEM content (for Netlify/serverless)
SNOWFLAKE_PRIVATE_KEY_PASSPHRASE = _env("SNOWFLAKE_PRIVATE_KEY_PASSPHRASE")
SNOWFLAKE_WAREHOUSE = _env("SNOWFLAKE_WAREHOUSE")
SNOWFLAKE_DATABASE = _env("SNOWFLAKE_DATABASE")
SNOWFLAKE_SCHEMA = _env("SNOWFLAKE_SCHEMA", "PUBLIC")
SNOWFLAKE_ROLE = _env("SNOWFLAKE_ROLE")


def get_snowflake_config() -> dict:
    """Get Snowflake config for inserts."""
    # Use inline PEM key (Netlify/serverless) or file path (local)
    private_key = SNOWFLAKE_PRIVATE_KEY.strip() if SNOWFLAKE_PRIVATE_KEY else None
    private_key_path = SNOWFLAKE_PRIVATE_KEY_PATH if not private_key else None
    return {
        "account_identifier": SNOWFLAKE_ACCOUNT,
        "user": SNOWFLAKE_USER,
        "private_key_path": private_key_path,
        "private_key_pem": private_key,
        "passphrase": SNOWFLAKE_PRIVATE_KEY_PASSPHRASE or None,
        "warehouse": SNOWFLAKE_WAREHOUSE,
        "database": SNOWFLAKE_DATABASE,
        "schema": SNOWFLAKE_SCHEMA,
        "role": SNOWFLAKE_ROLE or None,
    }
