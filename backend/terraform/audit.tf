# ── audit.tf ──────────────────────────────────────────────────────────────────
#
# Adds the persistent audit-log Lambda and two API Gateway routes.
#
# What this file does NOT touch:
#   • The existing DynamoDB table  (dynamodb.tf owns it)
#   • The existing IAM role/policy (lambda.tf owns it — already has full
#     DynamoDB access to the table + all indexes)
#   • The existing API Gateway, JWT authoriser, or Cognito pool
#
# New GSI on the existing table:
#   The AUDIT# pk pattern uses the existing gsi1-entityType-createdAt GSI
#   (gsi1pk = "AUDIT", createdAt = ts#uuid).  No new GSI is needed — the
#   existing projection_type = ALL index is sufficient.
#
# Routes added:
#   POST /audit   → audit Lambda  (any authenticated user)
#   GET  /audit   → audit Lambda  (admin sees all; others see own)
# ─────────────────────────────────────────────────────────────────────────────

# ── Lambda deployment package ─────────────────────────────────────────────────

data "archive_file" "audit" {
  type        = "zip"
  source_dir  = "${local.lambda_src}/audit"
  output_path = "${path.module}/.build/audit.zip"
}

resource "aws_lambda_function" "audit" {
  function_name    = "${var.app_name}-audit-${var.environment}"
  role             = aws_iam_role.lambda.arn       # reuse shared role
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  timeout          = 15
  memory_size      = 128
  filename         = data.archive_file.audit.output_path
  source_code_hash = data.archive_file.audit.output_base64sha256

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.main.name
      ENVIRONMENT = var.environment
    }
  }

  depends_on = [aws_iam_role_policy.lambda_main]
}

resource "aws_cloudwatch_log_group" "audit" {
  name              = "/aws/lambda/${aws_lambda_function.audit.function_name}"
  retention_in_days = 90   # keep audit logs longer than operational logs
}

# ── API Gateway integration ───────────────────────────────────────────────────

resource "aws_apigatewayv2_integration" "audit" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.audit.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 10000
}

resource "aws_apigatewayv2_route" "post_audit" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /audit"
  target             = "integrations/${aws_apigatewayv2_integration.audit.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "get_audit" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /audit"
  target             = "integrations/${aws_apigatewayv2_integration.audit.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# ── Lambda invoke permission from API Gateway ─────────────────────────────────

resource "aws_lambda_permission" "apigw_audit" {
  statement_id  = "AllowAPIGatewayAudit"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.audit.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
