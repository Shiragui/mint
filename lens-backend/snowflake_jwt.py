"""
Snowflake JWT generator for key-pair authentication.
Uses a private key file to create tokens for the Snowflake SQL API.
"""
import base64
import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import jwt
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
    load_pem_private_key,
)
from cryptography.hazmat.backends import default_backend


def get_public_key_fingerprint(private_key_path: str, passphrase: Optional[bytes] = None) -> str:
    """
    Generate SHA256 fingerprint of the public key for JWT issuer.
    Returns string like 'SHA256:base64hash'.
    """
    path = Path(private_key_path)
    if not path.exists():
        raise FileNotFoundError(f"Private key file not found: {private_key_path}")

    with open(path, "rb") as f:
        pem_data = f.read()

    private_key = load_pem_private_key(pem_data, passphrase, default_backend())
    public_key_raw = private_key.public_key().public_bytes(
        Encoding.DER,
        PublicFormat.SubjectPublicKeyInfo,
    )
    sha256_hash = hashlib.sha256(public_key_raw).digest()
    b64 = base64.b64encode(sha256_hash).decode("utf-8")
    return f"SHA256:{b64}"


def generate_snowflake_jwt(
    account_identifier: str,
    user: str,
    private_key_path: str,
    passphrase: Optional[str] = None,
    lifetime_minutes: int = 59,
) -> str:
    """
    Generate a JWT token for Snowflake SQL API key-pair authentication.

    Args:
        account_identifier: Snowflake account (e.g. xy12345 or org-account).
                           Periods are replaced with hyphens.
        user: Snowflake username
        private_key_path: Path to PEM private key file (e.g. rsa_key.p8)
        passphrase: Optional passphrase if key is encrypted
        lifetime_minutes: Token validity (max 60, default 59)

    Returns:
        JWT token string
    """
    # Normalize account: replace periods with hyphens, uppercase
    account = account_identifier.replace(".", "-").upper()
    user_upper = user.upper()
    qualified_username = f"{account}.{user_upper}"

    # Load private key
    path = Path(private_key_path)
    if not path.exists():
        raise FileNotFoundError(f"Private key file not found: {private_key_path}")

    with open(path, "rb") as f:
        pem_data = f.read()

    passphrase_bytes = passphrase.encode() if passphrase else None
    private_key = load_pem_private_key(pem_data, passphrase_bytes, default_backend())

    # Get public key fingerprint
    public_key_fp = get_public_key_fingerprint(private_key_path, passphrase_bytes)

    now = datetime.now(timezone.utc)
    payload = {
        "iss": f"{qualified_username}.{public_key_fp}",
        "sub": qualified_username,
        "iat": now,
        "exp": now + timedelta(minutes=lifetime_minutes),
    }

    token = jwt.encode(payload, private_key, algorithm="RS256")
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return token
