# backend/terraform/analysis_ssm.tf
#
# ONLY adds the three Azure OpenAI Parameter Store entries.
# No new IAM roles or policies needed — the shared Lambda IAM role
# in lambda.tf already grants ssm:GetParameter on parameter/${var.app_name}/*
# BUT: Azure OpenAI params use path /f5-asean/azure-openai/ which is
# OUTSIDE that prefix. So we need one small policy addition too.
#
# After terraform apply, fill real values with:
#   aws ssm put-parameter --name /f5-asean/azure-openai/endpoint \
#     --value "https://joko-aifoundry.openai.azure.com/openai/v1/chat/completions" \
#     --type SecureString --overwrite
#   aws ssm put-parameter --name /f5-asean/azure-openai/key \
#     --value "<your-key>" --type SecureString --overwrite
#   aws ssm put-parameter --name /f5-asean/azure-openai/deployment \
#     --value "gpt-4o" --type SecureString --overwrite

# ── Extend the shared Lambda policy to also read Azure OpenAI params ──────────

resource "aws_iam_role_policy" "lambda_ssm_azure" {
  name = "azure-openai-ssm"
  role = aws_iam_role.lambda.id   # same shared role used by dns_discovery

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter"]
      Resource = "arn:aws:ssm:${var.aws_region}:*:parameter/f5-asean/azure-openai/*"
    }]
  })
}

# ── Parameter Store placeholders ──────────────────────────────────────────────

resource "aws_ssm_parameter" "azure_endpoint" {
  name  = "/f5-asean/azure-openai/endpoint"
  type  = "SecureString"
  value = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "azure_key" {
  name  = "/f5-asean/azure-openai/key"
  type  = "SecureString"
  value = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "azure_deployment" {
  name  = "/f5-asean/azure-openai/deployment"
  type  = "SecureString"
  value = "gpt-4o"
  lifecycle { ignore_changes = [value] }
}
