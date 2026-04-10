# ── Cognito User Pool ─────────────────────────────────────────────────────────
#
# OTP-only flow:
#   1. User enters @f5.com email
#   2. Cognito sends a 6-digit code via SES
#   3. Frontend submits code → gets JWT tokens
#
# No passwords — custom auth challenge (CUSTOM_AUTH) flow.

resource "aws_cognito_user_pool" "main" {
  name = "${var.app_name}-${var.environment}"

  # Allow sign-in by email
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy is moot (OTP only) but required by Terraform schema
  password_policy {
    minimum_length                   = 8
    require_lowercase                = false
    require_numbers                  = false
    require_symbols                  = false
    require_uppercase                = false
    temporary_password_validity_days = 1
  }

  # Email config — use SES for delivery
  email_configuration {
    email_sending_account = "DEVELOPER"
    from_email_address    = var.ses_from_email
    source_arn            = aws_ses_email_identity.otp_sender.arn
  }

  # Schema — store role and name as custom attributes
  schema {
    name                     = "role"
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    string_attribute_constraints {
      min_length = 1
      max_length = 20
    }
  }

  schema {
    name                     = "display_name"
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    string_attribute_constraints {
      min_length = 1
      max_length = 100
    }
  }

  # Lambda triggers for custom auth (OTP)
  lambda_config {
    define_auth_challenge          = aws_lambda_function.define_auth_challenge.arn
    create_auth_challenge          = aws_lambda_function.create_auth_challenge.arn
    verify_auth_challenge_response = aws_lambda_function.verify_auth_challenge.arn
  }

  # MFA off — OTP is the auth mechanism
  mfa_configuration = "OFF"

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = {
    Name = "${var.app_name}-${var.environment}"
  }
}

# ── App client for the SPA ────────────────────────────────────────────────────
resource "aws_cognito_user_pool_client" "spa" {
  name         = "${var.app_name}-spa"
  user_pool_id = aws_cognito_user_pool.main.id

  # Custom auth only — no SRP password flow
  explicit_auth_flows = [
    "ALLOW_CUSTOM_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # No client secret — public SPA client
  generate_secret = false

  # Token validity
  access_token_validity  = 8    # hours
  id_token_validity      = 8    # hours
  refresh_token_validity = 30   # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}

# ── SES email identity for OTP delivery ──────────────────────────────────────
# NOTE: After first apply, you must verify this email in the AWS SES console
# (or it will be auto-verified if your account is out of SES sandbox).
resource "aws_ses_email_identity" "otp_sender" {
  email = var.ses_from_email
}

# ── Cognito Lambda permission grants ─────────────────────────────────────────
resource "aws_lambda_permission" "cognito_define" {
  statement_id  = "AllowCognitoDefine"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.define_auth_challenge.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

resource "aws_lambda_permission" "cognito_create" {
  statement_id  = "AllowCognitoCreate"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_auth_challenge.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

resource "aws_lambda_permission" "cognito_verify" {
  statement_id  = "AllowCognitoVerify"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.verify_auth_challenge.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
