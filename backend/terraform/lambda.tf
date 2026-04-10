# ── IAM role shared by all Lambda functions ───────────────────────────────────
resource "aws_iam_role" "lambda" {
  name = "${var.app_name}-lambda-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "lambda_main" {
  name = "scorecard-lambda-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # CloudWatch Logs
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        # DynamoDB — table + all indexes
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchWriteItem",
        ]
        Resource = [
          aws_dynamodb_table.main.arn,
          "${aws_dynamodb_table.main.arn}/index/*",
        ]
      },
      {
        # SES — for OTP email sending from create_auth_challenge
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
      },
      {
        # Parameter Store — read config at runtime
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:*:parameter/${var.app_name}/*"
      },
    ]
  })
}

# ── Lambda deployment package placeholders ────────────────────────────────────
# deploy.sh builds the real zips; these data sources reference them.
# Each function has its own zip so they can be updated independently.

locals {
  lambda_src = "${path.module}/../../backend/lambda"
}

# ── 1. dns_discovery ─────────────────────────────────────────────────────────
data "archive_file" "dns_discovery" {
  type        = "zip"
  source_dir  = "${local.lambda_src}/dns_discovery"
  output_path = "${path.module}/.build/dns_discovery.zip"
}

resource "aws_lambda_function" "dns_discovery" {
  function_name    = "${var.app_name}-dns-discovery-${var.environment}"
  role             = aws_iam_role.lambda.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  timeout          = var.lambda_timeout
  memory_size      = var.lambda_memory
  filename         = data.archive_file.dns_discovery.output_path
  source_code_hash = data.archive_file.dns_discovery.output_base64sha256
  layers           = [aws_lambda_layer_version.dnspython.arn]

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.main.name
      ENVIRONMENT = var.environment
    }
  }

  depends_on = [aws_iam_role_policy.lambda_main]
}

resource "aws_cloudwatch_log_group" "dns_discovery" {
  name              = "/aws/lambda/${aws_lambda_function.dns_discovery.function_name}"
  retention_in_days = 14
}

# ── 2. https_discovery ───────────────────────────────────────────────────────
data "archive_file" "https_discovery" {
  type        = "zip"
  source_dir  = "${local.lambda_src}/https_discovery"
  output_path = "${path.module}/.build/https_discovery.zip"
}

resource "aws_lambda_function" "https_discovery" {
  function_name    = "${var.app_name}-https-discovery-${var.environment}"
  role             = aws_iam_role.lambda.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  timeout          = var.lambda_timeout
  memory_size      = var.lambda_memory
  filename         = data.archive_file.https_discovery.output_path
  source_code_hash = data.archive_file.https_discovery.output_base64sha256

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.main.name
      ENVIRONMENT = var.environment
    }
  }

  depends_on = [aws_iam_role_policy.lambda_main]
}

resource "aws_cloudwatch_log_group" "https_discovery" {
  name              = "/aws/lambda/${aws_lambda_function.https_discovery.function_name}"
  retention_in_days = 14
}

# ── 3–5. Cognito custom auth triggers ────────────────────────────────────────
# Three tiny Lambdas that implement the OTP challenge flow.
# Source lives in backend/lambda/auth/

data "archive_file" "auth" {
  type        = "zip"
  source_dir  = "${local.lambda_src}/auth"
  output_path = "${path.module}/.build/auth.zip"
}

resource "aws_lambda_function" "define_auth_challenge" {
  function_name    = "${var.app_name}-define-auth-${var.environment}"
  role             = aws_iam_role.lambda.arn
  handler          = "define_auth_challenge.lambda_handler"
  runtime          = "python3.12"
  timeout          = 5
  memory_size      = 128
  filename         = data.archive_file.auth.output_path
  source_code_hash = data.archive_file.auth.output_base64sha256

  depends_on = [aws_iam_role_policy.lambda_main]
}

resource "aws_lambda_function" "create_auth_challenge" {
  function_name    = "${var.app_name}-create-auth-${var.environment}"
  role             = aws_iam_role.lambda.arn
  handler          = "create_auth_challenge.lambda_handler"
  runtime          = "python3.12"
  timeout          = 10
  memory_size      = 128
  filename         = data.archive_file.auth.output_path
  source_code_hash = data.archive_file.auth.output_base64sha256

  environment {
    variables = {
      SES_FROM_EMAIL = var.ses_from_email
      ENVIRONMENT    = var.environment
      # In non-prod, OTP is always 123456 (demo mode)
      DEMO_OTP_ENABLED = var.environment == "prod" ? "false" : "true"
    }
  }

  depends_on = [aws_iam_role_policy.lambda_main]
}

resource "aws_lambda_function" "verify_auth_challenge" {
  function_name    = "${var.app_name}-verify-auth-${var.environment}"
  role             = aws_iam_role.lambda.arn
  handler          = "verify_auth_challenge.lambda_handler"
  runtime          = "python3.12"
  timeout          = 5
  memory_size      = 128
  filename         = data.archive_file.auth.output_path
  source_code_hash = data.archive_file.auth.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT      = var.environment
      DEMO_OTP_ENABLED = var.environment == "prod" ? "false" : "true"
    }
  }

  depends_on = [aws_iam_role_policy.lambda_main]
}

resource "aws_cloudwatch_log_group" "define_auth" {
  name              = "/aws/lambda/${aws_lambda_function.define_auth_challenge.function_name}"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "create_auth" {
  name              = "/aws/lambda/${aws_lambda_function.create_auth_challenge.function_name}"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "verify_auth" {
  name              = "/aws/lambda/${aws_lambda_function.verify_auth_challenge.function_name}"
  retention_in_days = 14
}

# ── dnspython Lambda Layer ────────────────────────────────────────────────────
# Built by deploy.sh before terraform apply.
# Layer zip path: backend/terraform/.build/layer_dnspython.zip
data "archive_file" "layer_dnspython" {
  type        = "zip"
  source_dir  = "${path.module}/.build/layer_dnspython"
  output_path = "${path.module}/.build/layer_dnspython.zip"
}

resource "aws_lambda_layer_version" "dnspython" {
  layer_name          = "${var.app_name}-dnspython"
  filename            = data.archive_file.layer_dnspython.output_path
  source_code_hash    = data.archive_file.layer_dnspython.output_base64sha256
  compatible_runtimes = ["python3.12"]
  description         = "dnspython 2.x for DNS discovery"
}
