terraform {
  required_version = ">= 1.11, < 2.0"
  backend "s3" {}
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}
provider "aws" {
  region = var.aws_region
  default_tags { tags = { Project = var.project, Environment = var.environment, ManagedBy = "Terraform" } }
}
data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" { state = "available" }
locals {
  name       = "${var.project}-${var.environment}"
  azs        = slice(data.aws_availability_zones.available.names, 0, 2)
  components = toset(["backend", "frontend"])
}

locals {
  application_url = var.enable_https ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
}

locals {
  parameter_prefix     = "/${var.project}/${var.environment}"
  parameter_arn_prefix = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.parameter_prefix}"
}
