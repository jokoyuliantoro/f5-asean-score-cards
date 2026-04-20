"""
backend/lambda/audit/handler.py

Persistent audit-log Lambda.

Routes (all require Cognito JWT):
  POST /audit        — write one event (any authenticated user)
  GET  /audit        — list events
                       admin : all events, newest first, up to 500
                       others: own events only

DynamoDB access pattern (single-table, existing table):
  pk  = AUDIT#<actor-email>     — efficient per-actor queries
  sk  = <ISO-ts>#<uuid>         — ISO-8601 + UUID, lexicographically newest-last
                                   (we reverse on read for newest-first)
  GSI "gsi1-entityType-createdAt":
    gsi1pk    = AUDIT            — lets admin scan ALL audit rows
    createdAt = <ISO-ts>#<uuid>  — same value as sk for sort

  Existing IAM role already has full DynamoDB access to the table + indexes.

Environment variables (set in audit.tf):
  TABLE_NAME  — DynamoDB table (e.g. f5-scorecard-prod)
  ENVIRONMENT — prod | staging
"""

import json, os, uuid, re
from datetime import datetime, timezone
import boto3
from boto3.dynamodb.conditions import Key

# ── Config ────────────────────────────────────────────────────────────────────
TABLE_NAME  = os.environ["TABLE_NAME"]
REGION      = os.environ.get("AWS_REGION", "ap-southeast-1")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table    = dynamodb.Table(TABLE_NAME)

CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}

VALID_TYPES = {
    "login", "logout",
    "dns_probe_start", "dns_probe_done", "dns_probe_error",
}

MAX_EVENTS = 500  # per GET response


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resp(status, body):
    return {
        "statusCode": status,
        "headers":    {**CORS, "Content-Type": "application/json"},
        "body":       json.dumps(body, default=str),
    }

def _err(status, msg):
    return _resp(status, {"error": msg})

def _actor_from_claims(event):
    """Extract email + role from the JWT claims injected by API Gateway JWT authoriser."""
    claims = (
        event.get("requestContext", {})
             .get("authorizer", {})
             .get("jwt", {})
             .get("claims", {})
    )
    email = (
        claims.get("email") or
        claims.get("cognito:username") or
        "unknown"
    )
    # Role stored as a custom Cognito attribute or derived here
    # We trust the role sent in the POST body from the frontend (it mirrors
    # the role already resolved by getRoleForEmail at login time).
    return email, claims


def _ts_sk():
    """Sortable sk: ISO-8601 UTC + '#' + UUID — lexicographically ascending by time."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    return f"{now}#{uuid.uuid4()}"


# ── Handlers ──────────────────────────────────────────────────────────────────

def _handle_post(event):
    actor, _claims = _actor_from_claims(event)

    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return _err(400, "Invalid JSON body")

    event_type = body.get("type", "")
    if event_type not in VALID_TYPES:
        return _err(400, f"Unknown event type '{event_type}'")

    role = body.get("role", "readonly")
    meta = body.get("meta", {})
    if not isinstance(meta, dict):
        meta = {}

    # Truncate any string values in meta to 500 chars to avoid oversized items
    meta = {k: (v[:500] if isinstance(v, str) else v) for k, v in meta.items()}

    ts_sk = _ts_sk()
    item = {
        "pk":        f"AUDIT#{actor}",
        "sk":        ts_sk,
        "gsi1pk":    "AUDIT",
        "createdAt": ts_sk,          # same value — used as GSI sort key
        "id":        body.get("id") or str(uuid.uuid4()),
        "type":      event_type,
        "actor":     actor,
        "role":      role,
        "meta":      meta,
        "ts":        ts_sk.split("#")[0],   # clean ISO-8601 for frontend display
    }

    table.put_item(Item=item)
    return _resp(201, {"ok": True, "id": item["id"]})


def _handle_get(event):
    actor, claims = _actor_from_claims(event)

    # Determine if the caller is admin — we check the email against the
    # known admin set.  The frontend already enforces this in the UI, but
    # we double-check here so the API never leaks cross-user data.
    ADMIN_EMAILS = {"j.yuliantoro@f5.com"}  # extend if needed
    is_admin = actor.lower() in ADMIN_EMAILS

    qs = event.get("queryStringParameters") or {}
    filter_actor = qs.get("actor", "").strip().lower()

    items = []

    if is_admin and not filter_actor:
        # Admin with no filter → scan all AUDIT rows via GSI
        resp = table.query(
            IndexName="gsi1-entityType-createdAt",
            KeyConditionExpression=Key("gsi1pk").eq("AUDIT"),
            ScanIndexForward=False,   # newest first from GSI
            Limit=MAX_EVENTS,
        )
        items = resp.get("Items", [])
    else:
        # Non-admin, or admin filtered to specific actor
        target = filter_actor if (is_admin and filter_actor) else actor.lower()
        resp = table.query(
            KeyConditionExpression=Key("pk").eq(f"AUDIT#{target}"),
            ScanIndexForward=False,
            Limit=MAX_EVENTS,
        )
        items = resp.get("Items", [])

    # Reshape: drop internal DynamoDB keys, keep frontend shape
    events = [
        {
            "id":    item.get("id", ""),
            "type":  item.get("type", ""),
            "actor": item.get("actor", ""),
            "role":  item.get("role", "readonly"),
            "meta":  item.get("meta", {}),
            "ts":    item.get("ts", ""),
        }
        for item in items
    ]

    return _resp(200, {"events": events, "count": len(events)})


# ── Entry point ───────────────────────────────────────────────────────────────

def lambda_handler(event, _context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "").upper()

    if method == "OPTIONS":
        return _resp(200, {})
    if method == "POST":
        return _handle_post(event)
    if method == "GET":
        return _handle_get(event)

    return _err(405, f"Method {method} not allowed")
