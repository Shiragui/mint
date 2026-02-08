"""
Lightweight Snowflake SQL API client using REST (no heavy connector).
Uses JWT key-pair authentication.
"""
import json
import uuid
from typing import Any, Dict, List, Optional

import httpx
from snowflake_jwt import generate_snowflake_jwt


def execute_snowflake_sql(
    account_identifier: str,
    user: str,
    private_key_path: str,
    statement: str,
    bindings: Optional[Dict[str, Dict[str, Any]]] = None,
    warehouse: Optional[str] = None,
    database: Optional[str] = None,
    schema: Optional[str] = None,
    role: Optional[str] = None,
    passphrase: Optional[str] = None,
    timeout: int = 60,
) -> Dict[str, Any]:
    """
    Execute a SQL statement via Snowflake SQL API (REST).

    Args:
        account_identifier: Snowflake account (e.g. xy12345)
        user: Snowflake user
        private_key_path: Path to PEM private key
        statement: SQL statement (use ? for bind variables, then bindings "1", "2", ...)
        bindings: Optional {"1": {"type": "TEXT", "value": "..."}, ...}
        warehouse, database, schema, role: Execution context
        passphrase: Private key passphrase if encrypted
        timeout: Statement timeout in seconds

    Returns:
        API response JSON
    """
    token = generate_snowflake_jwt(
        account_identifier=account_identifier,
        user=user,
        private_key_path=private_key_path,
        passphrase=passphrase,
    )

    # Build account URL (account_identifier can be org-account or locator.region.cloud)
    account_clear = account_identifier.replace("_", "-").lower()
    url = f"https://{account_clear}.snowflakecomputing.com/api/v2/statements"

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
    }

    body: Dict[str, Any] = {
        "statement": statement,
        "timeout": timeout,
    }
    if bindings:
        body["bindings"] = bindings
    if warehouse:
        body["warehouse"] = warehouse
    if database:
        body["database"] = database
    if schema:
        body["schema"] = schema
    if role:
        body["role"] = role

    with httpx.post(url, headers=headers, json=body, timeout=timeout + 30) as resp:
        resp.raise_for_status()
        return resp.json()


def insert_lens_vault(
    account_identifier: str,
    user: str,
    private_key_path: str,
    record_id: str,
    image_base64: str,
    label: str,
    metadata: Dict[str, Any],
    warehouse: str,
    database: str,
    schema: str,
    role: Optional[str] = None,
    passphrase: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Insert a record into LENS_VAULT using bind variables.
    Uses bindings to safely handle base64 image and avoid SQL injection.
    """
    # Metadata as JSON string for VARIANT
    metadata_json = json.dumps(metadata) if metadata else "{}"

    statement = (
        "INSERT INTO LENS_VAULT (ID, IMAGE, LABEL, METADATA) "
        "VALUES (?, ?, ?, PARSE_JSON(?))"
    )
    bindings = {
        "1": {"type": "TEXT", "value": record_id},
        "2": {"type": "TEXT", "value": image_base64},
        "3": {"type": "TEXT", "value": label},
        "4": {"type": "TEXT", "value": metadata_json},
    }

    return execute_snowflake_sql(
        account_identifier=account_identifier,
        user=user,
        private_key_path=private_key_path,
        statement=statement,
        bindings=bindings,
        warehouse=warehouse,
        database=database,
        schema=schema,
        role=role,
        passphrase=passphrase,
    )
