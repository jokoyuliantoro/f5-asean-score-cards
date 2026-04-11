# ── latency_probe.tf ─────────────────────────────────────────────────────────
#
# Shared anycast detection service — same code deployed in two regions:
#   ap-southeast-1  (primary, co-located with dns_discovery / https_discovery)
#   us-east-1       (second vantage point for anycast confirmation)
#
# Logic: if an IP shows low latency from BOTH regions simultaneously, it is
# physically impossible for a unicast address — BGP anycast routing is confirmed.
#
# Called via Lambda.invoke() (not API Gateway) by dns_discovery and https_discovery.
# No DynamoDB access needed — pure compute, no layers.
# Recommended timeout: 15s (probes run in parallel, 5s each).
# ─────────────────────────────────────────────────────────────────────────────

# ── Deployment package ────────────────────────────────────────────────────────
data "archive_file" "latency_probe" {
  type        = "zip"
  source_dir  = "${path.module}/../../backend/lambda/latency_probe"
  output_path = "${path.module}/.build/latency_probe.zip"
}

# ── ap-southeast-1 (primary region — default provider) ───────────────────────
resource "aws_lambda_function" "latency_probe_sea" {
  function_name    = "${var.app_name}-latency-probe-${var.environment}"
  role             = aws_iam_role.lambda.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  timeout          = 15    # probes are parallel, 5s each + overhead
  memory_size      = 128   # pure stdlib TCP probes — minimal memory needed
  filename         = data.archive_file.latency_probe.output_path
  source_code_hash = data.archive_file.latency_probe.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT = var.environment
    }
  }

  depends_on = [aws_iam_role_policy.lambda_main]
}

resource "aws_cloudwatch_log_group" "latency_probe_sea" {
  name              = "/aws/lambda/${aws_lambda_function.latency_probe_sea.function_name}"
  retention_in_days = 14
}

# ── us-east-1 (second vantage point — uses us_east_1 provider alias) ─────────
# The us_east_1 provider alias is already defined in main.tf for CloudFront ACM.
# We reuse it here to deploy the same function code to a second region.

resource "aws_lambda_function" "latency_probe_use1" {
  provider         = aws.us_east_1
  function_name    = "${var.app_name}-latency-probe-${var.environment}"
  role             = aws_iam_role.lambda_use1.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  timeout          = 15
  memory_size      = 128
  filename         = data.archive_file.latency_probe.output_path
  source_code_hash = data.archive_file.latency_probe.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT = var.environment
    }
  }

  depends_on = [aws_iam_role.lambda_use1]
}

resource "aws_cloudwatch_log_group" "latency_probe_use1" {
  provider          = aws.us_east_1
  name              = "/aws/lambda/${aws_lambda_function.latency_probe_use1.function_name}"
  retention_in_days = 14
}

# ── IAM role for us-east-1 Lambda ─────────────────────────────────────────────
# us-east-1 needs its own IAM role (IAM is global but Lambda execution roles
# must be in the same account — we create a minimal one for the probe).
resource "aws_iam_role" "lambda_use1" {
  provider = aws.us_east_1
  name     = "${var.app_name}-lambda-probe-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_use1_logs" {
  provider   = aws.us_east_1
  role       = aws_iam_role.lambda_use1.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ── IAM: allow dns_discovery and https_discovery to invoke both probes ────────
# Adds lambda:InvokeFunction permission to the existing shared Lambda IAM role.
resource "aws_iam_role_policy" "lambda_invoke_probe" {
  name = "invoke-latency-probe"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = [
          aws_lambda_function.latency_probe_sea.arn,
          # us-east-1 ARN — constructed from known account/region/name
          # (Terraform can't reference cross-region resources directly via .arn
          #  without a data source, so we construct it explicitly)
          "arn:aws:lambda:us-east-1:${data.aws_caller_identity.current.account_id}:function:${var.app_name}-latency-probe-${var.environment}",
        ]
      }
    ]
  })
}

# ── Current AWS account ID (needed for cross-region ARN construction) ─────────
data "aws_caller_identity" "current" {}

# ── Outputs ───────────────────────────────────────────────────────────────────
output "latency_probe_sea_arn" {
  description = "Latency probe Lambda ARN in ap-southeast-1"
  value       = aws_lambda_function.latency_probe_sea.arn
}

output "latency_probe_use1_arn" {
  description = "Latency probe Lambda ARN in us-east-1"
  value       = aws_lambda_function.latency_probe_use1.arn
}
