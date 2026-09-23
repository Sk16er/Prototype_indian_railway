"""Small, framework-independent security primitives for source adapters."""

import hashlib
import hmac


def verify_hmac_signature(payload: bytes, signature: str | None, secret: str | None) -> bool:
    """Verify a SHA-256 HMAC header in ``sha256=<digest>`` or raw form.

    An unset secret is intentionally rejected: an unsigned feed must never be
    treated as a trusted operational source.
    """
    if not secret or not signature:
        return False
    supplied = signature.strip().lower()
    if supplied.startswith("sha256="):
        supplied = supplied.split("=", 1)[1]
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, supplied)
