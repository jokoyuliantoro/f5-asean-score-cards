"""
backend/lambda/users/handler.py

User registry Lambda.

Routes (all require Cognito JWT):
  GET    /users              — list all users  (admin only)
  POST   /users              — create user     (admin only)
  PUT    /users/{email}      — update role     (admin only, cannot demote self)
  DELETE /users/{email}      — remove user     (admin only, cannot remove self)

DynamoDB access pattern (single-table, existing table):
  pk  = USER#<email-lowercase>
  sk  = METADATA
  gsi1pk    = USER
  createdAt = <ISO-ts>        ← used by GSI for list-all-users queries

Bootstrap seeding:
  On GET /users, if the table has zero USER rows the handler seeds INITIAL_USERS
  so the first admin can immediately see the registry without a separate setup step.

Environment variables (set by users.tf):
  TABLE_NAME  — DynamoDB table (e.g. f5-scorecard-prod)
  ENVIRONMENT — prod | staging
"""

import json, os, uuid, re
from datetime import datetime, timezone
import boto3
from boto3.dynamodb.conditions import Key

# ── Config ────────────────────────────────────────────────────────────────────
TABLE_NAME = os.environ["TABLE_NAME"]
REGION     = os.environ.get("AWS_REGION", "ap-southeast-1")

dynamodb   = boto3.resource("dynamodb", region_name=REGION)
table      = dynamodb.Table(TABLE_NAME)

CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
}

VALID_ROLES    = {"admin", "user", "readonly"}
EMAIL_RE       = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MAX_NAME_LEN   = 100
MAX_EMAIL_LEN  = 254

# ── Seed data — matches frontend src/data/users.js ───────────────────────────
INITIAL_USERS = [
    {"email": "j.yuliantoro@f5.com", "name": "Joko Yuliantoro", "role": "admin"},
    {"email": "a.iswanto@f5.com",    "name": "A. Iswanto",      "role": "user"},
    {"email": "ky.cheong@f5.com",    "name": "KY Cheong",       "role": "user"},
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resp(status, body):
    return {
        "statusCode": status,
        "headers":    {**CORS, "Content-Type": "application/json"},
        "body":       json.dumps(body, default=str),
    }

def _err(status, msg):
    return _resp(status, {"error": msg})

def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

def _actor_from_claims(event):
    """Extract caller email from the Cognito JWT claims injected by API Gateway."""
    claims = (
        event.get("requestContext", {})
             .get("authorizer", {})
             .get("jwt", {})
             .get("claims", {})
    )
    email = (
        claims.get("email") or
        claims.get("cognito:username") or
        ""
    )
    return email.lower().strip()

def _path_email(event):
    """Extract {email} path parameter (URL-decoded) from API GW v2 event."""
    params = event.get("pathParameters") or {}
    raw = params.get("email", "")
    # API GW v2 passes the raw path segment — dots and @ are not encoded in
    # the path by browsers, but be safe and normalise.
    import urllib.parse
    return urllib.parse.unquote(raw).lower().strip()

def _item_to_user(item):
    """Reshape a DynamoDB item to the frontend user shape."""
    return {
        "email":     item.get("email", ""),
        "name":      item.get("name", ""),
        "role":      item.get("role", "readonly"),
        "country":   item.get("country", ""),
        "createdAt": item.get("createdAt", ""),
        "updatedAt": item.get("updatedAt", ""),
        "builtIn":   item.get("builtIn", False),
    }

def _is_admin(email):
    """Check if the given email belongs to an admin by querying DynamoDB."""
    resp = table.get_item(Key={"pk": f"USER#{email}", "sk": "METADATA"})
    item = resp.get("Item")
    if not item:
        return False
    return item.get("role") == "admin"

def _seed_if_empty():
    """Write INITIAL_USERS to DynamoDB if no USER rows exist yet (idempotent)."""
    resp = table.query(
        IndexName="gsi1-entityType-createdAt",
        KeyConditionExpression=Key("gsi1pk").eq("USER"),
        Limit=1,
    )
    if resp.get("Items"):
        return  # already seeded

    now = _now_iso()
    for u in INITIAL_USERS:
        email = u["email"].lower()
        table.put_item(Item={
            "pk":        f"USER#{email}",
            "sk":        "METADATA",
            "gsi1pk":    "USER",
            "email":     email,
            "name":      u["name"],
            "role":      u["role"],
            "builtIn":   True,
            "createdAt": now,
            "updatedAt": now,
        })


# ── Route handlers ────────────────────────────────────────────────────────────

def _handle_get(event):
    """GET /users — list all users. Admin only."""
    actor = _actor_from_claims(event)
    if not actor:
        return _err(401, "Unauthorized")
    if not _is_admin(actor):
        return _err(403, "Admin role required")

    # Seed on first access
    _seed_if_empty()

    resp = table.query(
        IndexName="gsi1-entityType-createdAt",
        KeyConditionExpression=Key("gsi1pk").eq("USER"),
        ScanIndexForward=True,
    )
    users = [_item_to_user(item) for item in resp.get("Items", [])]
    return _resp(200, {"users": users, "count": len(users)})


def _handle_post(event):
    """POST /users — create a user. Admin only."""
    actor = _actor_from_claims(event)
    if not actor:
        return _err(401, "Unauthorized")
    if not _is_admin(actor):
        return _err(403, "Admin role required")

    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return _err(400, "Invalid JSON body")

    email   = str(body.get("email",   "")).lower().strip()
    name    = str(body.get("name",    "")).strip()[:MAX_NAME_LEN]
    role    = str(body.get("role",    "readonly"))
    country = str(body.get("country", "")).strip()[:100]

    if not email or not EMAIL_RE.match(email):
        return _err(400, "Valid email required")
    if len(email) > MAX_EMAIL_LEN:
        return _err(400, "Email too long")
    if role not in VALID_ROLES:
        return _err(400, f"Invalid role '{role}'. Must be one of: {sorted(VALID_ROLES)}")

    # Check for duplicate
    existing = table.get_item(Key={"pk": f"USER#{email}", "sk": "METADATA"})
    if existing.get("Item"):
        return _err(409, f"User '{email}' already exists")

    now = _now_iso()
    item = {
        "pk":        f"USER#{email}",
        "sk":        "METADATA",
        "gsi1pk":    "USER",
        "email":     email,
        "name":      name or email,
        "role":      role,
        "country":   country,
        "builtIn":   False,
        "createdAt": now,
        "updatedAt": now,
    }
    table.put_item(Item=item)
    return _resp(201, {"user": _item_to_user(item)})


def _handle_put(event):
    """PUT /users/{email} — update role. Admin only, cannot demote self."""
    actor = _actor_from_claims(event)
    if not actor:
        return _err(401, "Unauthorized")
    if not _is_admin(actor):
        return _err(403, "Admin role required")

    target_email = _path_email(event)
    if not target_email:
        return _err(400, "Missing email path parameter")

    if target_email == actor:
        return _err(400, "Cannot change your own role")

    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return _err(400, "Invalid JSON body")

    new_role    = str(body.get("role",    "")).strip()
    new_name    = str(body.get("name",    "")).strip()[:MAX_NAME_LEN]
    new_country = str(body.get("country", "")).strip()[:100]

    if new_role and new_role not in VALID_ROLES:
        return _err(400, f"Invalid role '{new_role}'")

    existing_resp = table.get_item(Key={"pk": f"USER#{target_email}", "sk": "METADATA"})
    existing = existing_resp.get("Item")
    if not existing:
        return _err(404, f"User '{target_email}' not found")

    update_expr_parts = ["#upd = :upd"]
    expr_names  = {"#upd": "updatedAt"}
    expr_values = {":upd": _now_iso()}

    if new_role:
        update_expr_parts.append("#role = :role")
        expr_names["#role"]  = "role"
        expr_values[":role"] = new_role

    if new_name:
        update_expr_parts.append("#nm = :nm")
        expr_names["#nm"]  = "name"
        expr_values[":nm"] = new_name

    if new_country:
        update_expr_parts.append("#co = :co")
        expr_names["#co"]  = "country"
        expr_values[":co"] = new_country

    table.update_item(
        Key={"pk": f"USER#{target_email}", "sk": "METADATA"},
        UpdateExpression="SET " + ", ".join(update_expr_parts),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )

    # Re-fetch to return current state
    updated = table.get_item(Key={"pk": f"USER#{target_email}", "sk": "METADATA"}).get("Item", {})
    return _resp(200, {"user": _item_to_user(updated)})


def _handle_delete(event):
    """DELETE /users/{email} — remove user. Admin only, cannot remove self."""
    actor = _actor_from_claims(event)
    if not actor:
        return _err(401, "Unauthorized")
    if not _is_admin(actor):
        return _err(403, "Admin role required")

    target_email = _path_email(event)
    if not target_email:
        return _err(400, "Missing email path parameter")

    if target_email == actor:
        return _err(400, "Cannot remove your own account")

    existing_resp = table.get_item(Key={"pk": f"USER#{target_email}", "sk": "METADATA"})
    if not existing_resp.get("Item"):
        return _err(404, f"User '{target_email}' not found")

    table.delete_item(Key={"pk": f"USER#{target_email}", "sk": "METADATA"})
    return _resp(200, {"ok": True, "deleted": target_email})


# ── Entry point ───────────────────────────────────────────────────────────────

def lambda_handler(event, _context):
    method = (
        event.get("requestContext", {})
             .get("http", {})
             .get("method", "")
             .upper()
    )

    if method == "OPTIONS":
        return _resp(200, {})
    if method == "GET":
        return _handle_get(event)
    if method == "POST":
        return _handle_post(event)
    if method == "PUT":
        return _handle_put(event)
    if method == "DELETE":
        return _handle_delete(event)

    return _err(405, f"Method {method} not allowed")
