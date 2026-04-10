# ── DynamoDB single table ─────────────────────────────────────────────────────
#
# Access patterns served by this table:
#
#   pk                        sk                        Use
#   ─────────────────────     ─────────────────────     ──────────────────────
#   ACCOUNT#<id>              METADATA                  Account record
#   ACCOUNT#<id>              JOB#<jobId>               Job record (all pillars)
#   JOB#<jobId>               PILLAR#dns                DNS discovery result
#   JOB#<jobId>               PILLAR#https              HTTPS discovery result
#   USER#<email>              METADATA                  User record (role, name)
#
# GSI:  gsi1pk = entityType, gsi1sk = createdAt
#       → list all accounts, list all jobs (dashboard queries)

resource "aws_dynamodb_table" "main" {
  name         = "${var.app_name}-${var.environment}"
  billing_mode = "PAY_PER_REQUEST" # on-demand — zero cost when idle
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name               = "gsi1-entityType-createdAt"
    hash_key           = "gsi1pk"
    range_key          = "createdAt"
    projection_type    = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.app_name}-${var.environment}"
  }
}
