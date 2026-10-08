variable "grafana_aws_account_id" {
  type        = string
  default     = ""
  description = "Grafana's AWS account ID shown by the CloudWatch data source; not your AWS account ID."
  validation {
    condition     = var.grafana_aws_account_id == "" || can(regex("^[0-9]{12}$", var.grafana_aws_account_id))
    error_message = "Use the 12-digit Grafana AWS account ID."
  }
}
variable "grafana_external_id" {
  type        = string
  default     = ""
  description = "Unique external ID displayed by your Grafana Cloud stack."
}
resource "aws_iam_role" "grafana" {
  count = var.grafana_aws_account_id == "" ? 0 : 1
  name  = "${local.name}-grafana"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow", Principal = { AWS = "arn:aws:iam::${var.grafana_aws_account_id}:root" }, Action = "sts:AssumeRole",
    Condition = { StringEquals = { "sts:ExternalId" = var.grafana_external_id } }
  }] })
  lifecycle {
    precondition {
      condition     = var.grafana_external_id != ""
      error_message = "Grafana trust must include your stack's external ID."
    }
  }
}
resource "aws_iam_role_policy" "grafana" {
  count = var.grafana_aws_account_id == "" ? 0 : 1
  role  = aws_iam_role.grafana[0].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["cloudwatch:ListMetrics", "cloudwatch:GetMetricData", "cloudwatch:GetMetricStatistics"], Resource = "*", Condition = { StringEquals = { "aws:RequestedRegion" = var.aws_region } } },
    { Effect = "Allow", Action = ["logs:DescribeLogGroups", "logs:GetQueryResults", "logs:StopQuery"], Resource = "*", Condition = { StringEquals = { "aws:RequestedRegion" = var.aws_region } } },
    { Effect = "Allow", Action = ["logs:DescribeLogStreams", "logs:GetLogGroupFields", "logs:StartQuery", "logs:GetLogEvents"], Resource = [for group in aws_cloudwatch_log_group.app : "${group.arn}:*"] }
  ] })
}
output "grafana_role_arn" { value = try(aws_iam_role.grafana[0].arn, null) }
output "grafana_settings" {
  value = {
    region    = var.aws_region, cluster = local.name,
    services  = { for k, s in aws_ecs_service.app : k => s.name },
    database  = aws_db_instance.main.identifier, load_balancer = aws_lb.main.arn_suffix,
    namespace = "SmartCanteen/${local.name}"
  }
}
