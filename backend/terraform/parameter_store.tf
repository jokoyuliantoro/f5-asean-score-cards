# ── Parameter Store ───────────────────────────────────────────────────────────
# Lambdas read these at cold-start to avoid hardcoding values.

resource "aws_ssm_parameter" "table_name" {
  name  = "/${var.app_name}/TABLE_NAME"
  type  = "String"
  value = aws_dynamodb_table.main.name
}

resource "aws_ssm_parameter" "cognito_pool_id" {
  name  = "/${var.app_name}/COGNITO_USER_POOL_ID"
  type  = "String"
  value = aws_cognito_user_pool.main.id
}

resource "aws_ssm_parameter" "cognito_client_id" {
  name  = "/${var.app_name}/COGNITO_CLIENT_ID"
  type  = "String"
  value = aws_cognito_user_pool_client.spa.id
}

resource "aws_ssm_parameter" "ses_from_email" {
  name  = "/${var.app_name}/SES_FROM_EMAIL"
  type  = "String"
  value = var.ses_from_email
}
