"""BDMS submission contract; network dispatch is intentionally opt-in."""

from datetime import datetime
import hashlib
import json


def build_bdms_submission(schedule, plan_type: str = "weekly") -> dict:
    items = []
    for row in schedule.to_dict("records") if schedule is not None else []:
        items.append({key: (value.isoformat() if isinstance(value, datetime) else value) for key, value in row.items()})
    body = {"schema_version": "bdms-possession-v1", "plan_type": plan_type,
            "generated_at": datetime.now().isoformat(), "items": items}
    canonical = json.dumps(body, sort_keys=True, default=str).encode("utf-8")
    body["idempotency_key"] = hashlib.sha256(canonical).hexdigest()
    body["dispatch_mode"] = "preview"
    return body
