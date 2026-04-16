# ── S3 bucket for SPA ─────────────────────────────────────────────────────────
resource "aws_s3_bucket" "spa" {
  bucket = "${var.app_name}-spa-${var.environment}-${random_id.suffix.hex}"
}

resource "random_id" "suffix" {
  byte_length = 4
}

# ── Enable static website hosting ─────────────────────────────────────────────
resource "aws_s3_bucket_website_configuration" "spa" {
  bucket = aws_s3_bucket.spa.id

  index_document {
    suffix = "index.html"
  }

  # SPA routing — serve index.html for all 404s so React handles routing
  error_document {
    key = "index.html"
  }
}

# ── Public access must be unblocked for S3 website endpoint ───────────────────
resource "aws_s3_bucket_public_access_block" "spa" {
  bucket = aws_s3_bucket.spa.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_versioning" "spa" {
  bucket = aws_s3_bucket.spa.id
  versioning_configuration {
    status = "Enabled"
  }
}

# ── S3 bucket policy — allow public read restricted to Cloudflare IPs ─────────
# Cloudflare publishes its egress IP ranges; restricting to these prevents
# direct S3-URL access while remaining compatible with Cloudflare's proxy.
# Full list: https://www.cloudflare.com/ips/
resource "aws_s3_bucket_policy" "spa" {
  bucket = aws_s3_bucket.spa.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudflareIPs"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.spa.arn}/*"
        Condition = {
          IpAddress = {
            "aws:SourceIp" = [
              # Cloudflare IPv4 ranges (current as of 2025)
              "173.245.48.0/20",
              "103.21.244.0/22",
              "103.22.200.0/22",
              "103.31.4.0/22",
              "141.101.64.0/18",
              "108.162.192.0/18",
              "190.93.240.0/20",
              "188.114.96.0/20",
              "197.234.240.0/22",
              "198.41.128.0/17",
              "162.158.0.0/15",
              "104.16.0.0/13",
              "104.24.0.0/14",
              "172.64.0.0/13",
              "131.0.72.0/22",
              # Cloudflare IPv6 ranges
              "2400:cb00::/32",
              "2606:4700::/32",
              "2803:f800::/32",
              "2405:b500::/32",
              "2405:8100::/32",
              "2a06:98c0::/29",
              "2c0f:f248::/32"
            ]
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.spa]
}
