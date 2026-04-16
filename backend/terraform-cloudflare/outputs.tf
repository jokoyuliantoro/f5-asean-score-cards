output "spa_bucket" {
  description = "S3 bucket name for the SPA"
  value       = aws_s3_bucket.spa.id
}

output "s3_website_endpoint" {
  description = "S3 static website endpoint (origin for Cloudflare)"
  value       = aws_s3_bucket_website_configuration.spa.website_endpoint
}

output "app_url" {
  description = "Public URL of the deployed application (via Cloudflare)"
  value       = "https://${var.cloudflare_subdomain}.${var.cloudflare_zone_name}"
}

output "api_gateway_url" {
  description = "API Gateway invoke URL (injected into frontend build)"
  value       = "${aws_apigatewayv2_api.main.api_endpoint}/${aws_apigatewayv2_stage.main.name}"
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "Cognito App Client ID (injected into frontend build)"
  value       = aws_cognito_user_pool_client.spa.id
}

output "dynamodb_table_name" {
  description = "DynamoDB table name"
  value       = aws_dynamodb_table.main.name
}
