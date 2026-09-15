variable "aws_region" { default = "ap-south-1" }
variable "project" {
  default = "smartcanteen"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,17}$", var.project))
    error_message = "Use 3-18 lowercase letters, numbers or hyphens."
  }
}
variable "environment" {
  default = "exam"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,9}$", var.environment))
    error_message = "Use 2-10 lowercase letters, numbers or hyphens."
  }
}
variable "github_backend_repository" { default = "patil-rushikesh/SmartCanteen-Express" }
variable "github_frontend_repository" { default = "patil-rushikesh/SmartCanteenFrontend" }
variable "github_environment" { default = "exam" }
variable "github_oidc_provider_arn" { type = string }
variable "certificate_arn" {
  default     = ""
  type        = string
  description = "Issued ACM certificate in the same AWS region as the ALB."
}
variable "domain_name" {
  default     = ""
  type        = string
  description = "Public hostname covered by the certificate, without https://."
  validation {
    condition     = var.domain_name == "" || can(regex("^[a-zA-Z0-9][a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", var.domain_name))
    error_message = "Supply a hostname such as canteen.example.com."
  }
}
variable "route53_zone_id" {
  type        = string
  default     = ""
  description = "Optional hosted zone; otherwise create the DNS alias externally."
}
variable "vpc_cidr" { default = "10.42.0.0/16" }
variable "database_instance_class" { default = "db.t4g.micro" }
variable "database_multi_az" { default = false }
variable "cache_node_type" { default = "cache.t4g.micro" }
variable "payment_mode" {
  default = "fake"
  validation {
    condition     = contains(["razorpay", "fake"], var.payment_mode)
    error_message = "Use razorpay or fake."
  }
}
variable "razorpay_public_key" {
  type        = string
  default     = ""
  description = "Public checkout key; private keys belong in SSM Parameter Store."
}
variable "deletion_protection" { default = false }

variable "enable_https" {
  type        = bool
  default     = false
  description = "Enable for real users. HTTP is provided only for the exam demo."
}
variable "high_availability" {
  type        = bool
  default     = false
  description = "Two NAT gateways and two Redis nodes; exam mode uses one of each."
}

variable "database_password_version" {
  type        = number
  default     = 1
  description = "Increment when rotating DB_PASSWORD in SSM, then apply before restarting ECS."
}
