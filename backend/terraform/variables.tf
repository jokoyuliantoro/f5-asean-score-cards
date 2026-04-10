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

variable "cloudfront_price_class" {
  description = "CloudFront price class (PriceClass_100 = US/EU only, cheapest)"
  type        = string
  default     = "PriceClass_All"
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
