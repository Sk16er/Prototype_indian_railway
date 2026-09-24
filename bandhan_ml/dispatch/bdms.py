"""BDMS submission contract; network dispatch is intentionally opt-in.

Idempotency key is derived deterministically from plan_type + sorted item
content ONLY — never from generated_at or any wall-clock value. Two calls
with identical schedule → identical key → safe to use as an outbox key.
"""

from datetime import datetime
import hashlib
import json


def build_bdms_submission(schedule, plan_type: str = "weekly") -> dict:
    items = []
    for row in schedule.to_dict("records") if schedule is not None else []:
        items.append({key: (value.isoformat() if isinstance(value, datetime) else value) for key, value in row.items()})

    # Phase 1 fix: derive idempotency key from STABLE content only.
    # generated_at is added AFTER hashing so it never affects the key.
    canonical_for_key = {
        "schema_version": "bdms-possession-v1",
        "plan_type": plan_type,
        "items": items,
    }
    canonical_bytes = json.dumps(canonical_for_key, sort_keys=True, default=str).encode("utf-8")
    idempotency_key = hashlib.sha256(canonical_bytes).hexdigest()

    return {
        "schema_version": "bdms-possession-v1",
        "plan_type": plan_type,
        "generated_at": datetime.now().isoformat(),  # informational only — NOT part of key
        "items": items,
        "idempotency_key": idempotency_key,
        "dispatch_mode": "preview",
    }
