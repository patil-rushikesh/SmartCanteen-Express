variable "enable_operating_schedule" {
  type        = bool
  default     = true
  description = "Daily 06:00-17:00 Asia/Kolkata application hours; RDS warm-up starts 05:30."
}
variable "daytime_replicas" {
  type    = number
  default = 2
  validation {
    condition     = var.daytime_replicas >= 1 && floor(var.daytime_replicas) == var.daytime_replicas
    error_message = "Use a positive integer replica count."
  }
}
variable "alert_email" {
  type        = string
  default     = ""
  description = "Confirm the SNS subscription email after apply."
}
resource "aws_sns_topic" "operations" {
  name = "${local.name}-operations"
}
resource "aws_sns_topic_subscription" "operations" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.operations.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
resource "aws_iam_role" "operations" {
  count = var.enable_operating_schedule ? 1 : 0
  name  = "${local.name}-operations"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole"
  }] })
}
resource "aws_cloudwatch_log_group" "operations" {
  count             = var.enable_operating_schedule ? 1 : 0
  name              = "/aws/lambda/${local.name}-operations"
  retention_in_days = 30
}
resource "aws_iam_role_policy" "operations" {
  count = var.enable_operating_schedule ? 1 : 0
  role  = aws_iam_role.operations[0].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ecs:DescribeServices", "ecs:UpdateService"], Resource = [for s in aws_ecs_service.app : s.id] },
    { Effect = "Allow", Action = ["ecs:ListTasks"], Resource = "*", Condition = { ArnEquals = { "ecs:cluster" = aws_ecs_cluster.main.arn } } },
    { Effect = "Allow", Action = ["rds:DescribeDBInstances", "rds:StartDBInstance", "rds:StopDBInstance"], Resource = aws_db_instance.main.arn },
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.operations[0].arn}:*" },
    { Effect = "Allow", Action = ["cloudwatch:PutMetricData"], Resource = "*", Condition = { StringEquals = { "cloudwatch:namespace" = "SmartCanteen/${local.name}" } } }
  ] })
}
data "archive_file" "operations" {
  type        = "zip"
  source_file = "${path.module}/../lambda/operations.py"
  output_path = "${path.module}/operations.zip"
}
resource "aws_lambda_function" "operations" {
  count                          = var.enable_operating_schedule ? 1 : 0
  function_name                  = "${local.name}-operations"
  role                           = aws_iam_role.operations[0].arn
  runtime                        = "python3.12"
  handler                        = "operations.handler"
  filename                       = data.archive_file.operations.output_path
  source_code_hash               = data.archive_file.operations.output_base64sha256
  timeout                        = 45
  reserved_concurrent_executions = 1
  environment {
    variables = {
      CLUSTER          = aws_ecs_cluster.main.name
      SERVICES         = jsonencode([for s in aws_ecs_service.app : s.name])
      DATABASE         = aws_db_instance.main.identifier
      REPLICAS         = tostring(var.daytime_replicas)
      APP_URL          = local.application_url
      METRIC_NAMESPACE = "SmartCanteen/${local.name}"
    }
  }
  depends_on = [aws_iam_role_policy.operations]
}
resource "aws_cloudwatch_event_rule" "operations" {
  count               = var.enable_operating_schedule ? 1 : 0
  name                = "${local.name}-operations"
  schedule_expression = "rate(1 minute)"
}
resource "aws_cloudwatch_event_target" "operations" {
  count = var.enable_operating_schedule ? 1 : 0
  rule  = aws_cloudwatch_event_rule.operations[0].name
  arn   = aws_lambda_function.operations[0].arn
  retry_policy {
    maximum_event_age_in_seconds = 60
    maximum_retry_attempts       = 0
  }
}
resource "aws_lambda_permission" "operations" {
  count         = var.enable_operating_schedule ? 1 : 0
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.operations[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.operations[0].arn
}
resource "aws_cloudwatch_metric_alarm" "operations_heartbeat" {
  count               = var.enable_operating_schedule ? 1 : 0
  alarm_name          = "${local.name}-operations-heartbeat"
  namespace           = "SmartCanteen/${local.name}"
  metric_name         = "OperationsHeartbeat"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
}
resource "aws_cloudwatch_metric_alarm" "availability" {
  for_each            = var.enable_operating_schedule ? local.components : toset([])
  alarm_name          = "${local.name}-${each.key}-availability"
  namespace           = "SmartCanteen/${local.name}"
  metric_name         = "Availability"
  dimensions          = { Component = each.key }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_description   = "Failed public probes during 06:00-17:00 IST. Check RDS readiness, ECS events, and rollback runbook."
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
}
output "operations_topic_arn" { value = aws_sns_topic.operations.arn }
