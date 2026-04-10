# ── API Gateway HTTP API (v2) ─────────────────────────────────────────────────
#
# Routes:
#   POST /discovery/dns    → dns_discovery Lambda
#   POST /discovery/https  → https_discovery Lambda
#   GET  /jobs/{jobId}     → get job status (dns_discovery handles this too)
#
# Auth: Cognito JWT authorizer on all routes.

resource "aws_apigatewayv2_api" "main" {
  name          = "${var.app_name}-api-${var.environment}"
  protocol_type = "HTTP"
  description   = "F5 ASEAN Scorecard API"

  cors_configuration {
    allow_headers = ["Content-Type", "Authorization"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_origins = ["*"] # Tighten to CloudFront domain after first deploy
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_stage" "main" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "v1"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gw.arn
  }
}

resource "aws_cloudwatch_log_group" "api_gw" {
  name              = "/aws/apigateway/${var.app_name}-${var.environment}"
  retention_in_days = 14
}

# ── JWT Authorizer (Cognito) ──────────────────────────────────────────────────
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.spa.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

# ── Integrations ──────────────────────────────────────────────────────────────
resource "aws_apigatewayv2_integration" "dns_discovery" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.dns_discovery.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000 # just under Lambda max
}

resource "aws_apigatewayv2_integration" "https_discovery" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.https_discovery.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

# ── Routes ────────────────────────────────────────────────────────────────────
resource "aws_apigatewayv2_route" "post_dns" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /discovery/dns"
  target             = "integrations/${aws_apigatewayv2_integration.dns_discovery.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "post_https" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /discovery/https"
  target             = "integrations/${aws_apigatewayv2_integration.https_discovery.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "get_job" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /jobs/{jobId}"
  target             = "integrations/${aws_apigatewayv2_integration.dns_discovery.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# ── Lambda invoke permissions from API Gateway ────────────────────────────────
resource "aws_lambda_permission" "apigw_dns" {
  statement_id  = "AllowAPIGatewayDNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.dns_discovery.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_https" {
  statement_id  = "AllowAPIGatewayHTTPS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.https_discovery.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
