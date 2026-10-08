resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = local.name
  dashboard_body = jsonencode({ widgets = [
    { type = "text", x = 0, y = 0, width = 24, height = 2, properties = { markdown = "# Smart Canteen exam monitoring\nECS/PM2 process logs, Nginx access logs, ALB traffic, PostgreSQL and Redis. Metrics may take several minutes to appear." } },
    { type = "metric", x = 0, y = 2, width = 12, height = 6, properties = {
      title   = "ECS CPU (%)", region = var.aws_region, period = 60, stat = "Average",
      metrics = [for k in local.components : ["AWS/ECS", "CPUUtilization", "ClusterName", local.name, "ServiceName", aws_ecs_service.app[k].name]]
    } },
    { type = "metric", x = 12, y = 2, width = 12, height = 6, properties = {
      title   = "ECS memory (%)", region = var.aws_region, period = 60, stat = "Average",
      metrics = [for k in local.components : ["AWS/ECS", "MemoryUtilization", "ClusterName", local.name, "ServiceName", aws_ecs_service.app[k].name]]
    } },
    { type = "metric", x = 0, y = 8, width = 12, height = 6, properties = {
      title   = "ALB requests and target errors", region = var.aws_region, period = 60, stat = "Sum",
      metrics = [["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.main.arn_suffix], ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.main.arn_suffix]]
    } },
    { type = "metric", x = 12, y = 8, width = 12, height = 6, properties = {
      title   = "ALB response time (seconds)", region = var.aws_region, period = 60, stat = "Average",
      metrics = [["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.main.arn_suffix]]
    } },
    { type = "metric", x = 0, y = 14, width = 12, height = 6, properties = {
      title   = "RDS CPU and connections", region = var.aws_region, period = 60, stat = "Average",
      metrics = [["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.main.identifier], ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", aws_db_instance.main.identifier]]
    } },
    { type = "metric", x = 12, y = 14, width = 12, height = 6, properties = {
      title   = "Redis engine CPU (%)", region = var.aws_region, period = 60, stat = "Average",
      metrics = [for id in aws_elasticache_replication_group.main.member_clusters : ["AWS/ElastiCache", "EngineCPUUtilization", "CacheClusterId", id, "CacheNodeId", "0001"]]
    } },
    { type = "log", x = 0, y = 20, width = 24, height = 6, properties = {
      title = "Recent API and PM2 logs", region = var.aws_region, view = "table",
      query = "SOURCE '${aws_cloudwatch_log_group.app["backend"].name}' | fields @timestamp, @message | sort @timestamp desc | limit 30"
    } }
  ] })
}
resource "aws_cloudwatch_metric_alarm" "ecs_cpu" {
  for_each            = local.components
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
  alarm_name          = "${local.name}-${each.key}-cpu"
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  dimensions          = { ClusterName = local.name, ServiceName = aws_ecs_service.app[each.key].name }
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
}
resource "aws_cloudwatch_metric_alarm" "unhealthy" {
  for_each            = local.components
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
  alarm_name          = "${local.name}-${each.key}-unhealthy"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  dimensions          = { LoadBalancer = aws_lb.main.arn_suffix, TargetGroup = aws_lb_target_group.app[each.key].arn_suffix }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
}
resource "aws_cloudwatch_metric_alarm" "database_storage" {
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
  alarm_name          = "${local.name}-database-storage"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5368709120
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "missing"
}
output "monitoring_dashboard_url" {
  value = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards/dashboard/${aws_cloudwatch_dashboard.main.dashboard_name}"
}

resource "aws_cloudwatch_metric_alarm" "latency" {
  alarm_name          = "${local.name}-latency-p95"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  dimensions          = { LoadBalancer = aws_lb.main.arn_suffix }
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
}
resource "aws_cloudwatch_metric_alarm" "error_rate" {
  alarm_name          = "${local.name}-target-error-rate"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 1
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
  metric_query {
    id          = "rate"
    expression  = "IF(requests >= 20, 100 * FILL(errors, 0) / requests, 0)"
    label       = "Target 5xx percentage (minimum 20 requests)"
    return_data = true
  }
  metric_query {
    id = "errors"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      dimensions  = { LoadBalancer = aws_lb.main.arn_suffix }
      period      = 300
      stat        = "Sum"
    }
  }
  metric_query {
    id = "requests"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      dimensions  = { LoadBalancer = aws_lb.main.arn_suffix }
      period      = 300
      stat        = "Sum"
    }
  }
}
