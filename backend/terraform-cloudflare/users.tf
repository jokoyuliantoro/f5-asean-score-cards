# ── Users Lambda + API routes ─────────────────────────────────────────────────
#
# Manages the user registry stored in the existing DynamoDB single table.
# Access pattern:  pk = USER#<email>  /  sk = METADATA
# GSI:             gsi1pk = USER  → list all users via gsi1-entityType-createdAt
#
# Routes:
#   GET    /users              → list all users   (admin only)
#   POST   /users              → create user      (admin only)
#   PUT    /users/{email}      → update role/name (admin only)
#   DELETE /users/{email}      → remove user      (admin only)
#
# CORS: PUT and DELETE are added to the existing api_gateway.tf allow_methods list.
# If you have already deployed api_gateway.tf with ["GET","POST","OPTIONS"] you
# need to update the cors_configuration block there to add PUT and DELETE, then
# run: terraform apply -target=aws_apigatewayv2_api.main

# ── Lambda package ────────────────────────────────────────────────────────────
data "archive_file" "users" {
  type        = "zip"
  source_dir  = "${local.lambda_src}/users"
  output_path = "${path.module}/.build/users.zip"
}

resource "aws_lambda_function" "users" {
  function_name    = "${var.app_name}-users-${var.environment}"
  role             = aws_iam_role.lambda.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  timeout          = 15
  memory_size      = 128
  filename         = data.archive_file.users.output_path
  source_code_hash = data.archive_file.users.output_base64sha256

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.main.name
      ENVIRONMENT = var.environment
    }
  }

  depends_on = [aws_iam_role_policy.lambda_main]
}

resource "aws_cloudwatch_log_group" "users" {
  name              = "/aws/lambda/${aws_lambda_function.users.function_name}"
  retention_in_days = 14
}

# ── API Gateway integration ───────────────────────────────────────────────────
resource "aws_apigatewayv2_integration" "users" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.users.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 15000
}

# ── Routes ────────────────────────────────────────────────────────────────────
resource "aws_apigatewayv2_route" "get_users" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /users"
  target             = "integrations/${aws_apigatewayv2_integration.users.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "post_users" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /users"
  target             = "integrations/${aws_apigatewayv2_integration.users.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "put_user" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "PUT /users/{email}"
  target             = "integrations/${aws_apigatewayv2_integration.users.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "delete_user" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "DELETE /users/{email}"
  target             = "integrations/${aws_apigatewayv2_integration.users.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# ── Lambda invoke permission ──────────────────────────────────────────────────
resource "aws_lambda_permission" "apigw_users" {
  statement_id  = "AllowAPIGatewayUsers"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.users.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
