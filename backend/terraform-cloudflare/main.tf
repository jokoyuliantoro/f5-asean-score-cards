terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  backend "s3" {
    # Filled at init time via -backend-config flags in deploy.sh
    # bucket = var.tf_state_bucket
    # key    = "scorecard/terraform.tfstate"
    # region = "ap-southeast-1"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "f5-asean-scorecard"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# us-east-1 alias — needed by latency_probe.tf for the second vantage point Lambda
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "f5-asean-scorecard"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Cloudflare provider — API token via var or TF_VAR_cloudflare_api_token env var
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
