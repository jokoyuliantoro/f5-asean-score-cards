variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-southeast-1"
}

variable "environment" {
  description = "Environment name (prod, staging)"
  type        = string
  default     = "prod"
}

variable "app_name" {
  description = "Application name prefix for all resources"
  type        = string
  default     = "f5-scorecard"
}

variable "ses_from_email" {
  description = "Verified SES email address used to send OTPs"
  type        = string
  # Set this to j.yuliantoro@f5.com after verifying in SES
}

variable "admin_email" {
  description = "Initial admin user email seeded into Cognito"
  type        = string
  default     = "j.yuliantoro@f5.com"
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 30
}

variable "lambda_memory" {
  description = "Lambda function memory in MB"
  type        = number
  default     = 256
}

variable "demo_otp_enabled" {
  description = "When true, skips SES and accepts OTP 123456 for all logins (dev/demo use only)"
  type        = bool
  default     = false
}

# ── Cloudflare ─────────────────────────────────────────────────────────────────
variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone:Edit and DNS:Edit permissions"
  type        = string
  sensitive   = true
  # Set via TF_VAR_cloudflare_api_token env var — do NOT put this in tfvars
}

variable "cloudflare_zone_name" {
  description = "Root domain name as it appears in your Cloudflare account (e.g. f5-asean.example.com)"
  type        = string
}

variable "cloudflare_subdomain" {
  description = "Subdomain for the SPA (e.g. 'scorecard' → scorecard.yourdomain.com). Use '@' for root domain."
  type        = string
  default     = "scorecard"
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID — found in the Cloudflare Dashboard right sidebar under 'Account ID'"
  type        = string
}
