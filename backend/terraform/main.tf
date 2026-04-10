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

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1" # CloudFront ACM cert must be in us-east-1

  default_tags {
    tags = {
      Project     = "f5-asean-scorecard"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
