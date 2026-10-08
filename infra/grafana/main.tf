terraform {
  required_version = ">= 1.11, < 2.0"
  backend "s3" {}
  required_providers {
    grafana = { source = "grafana/grafana", version = "~> 4.0" }
  }
}
# GRAFANA_URL and GRAFANA_AUTH are read from the environment by the provider.
provider "grafana" {}
variable "aws_region" { default = "ap-south-1" }
variable "cloudwatch_role_arn" { type = string }
variable "cluster_name" { type = string }
variable "database_identifier" { type = string }
variable "load_balancer_arn_suffix" { type = string }
resource "grafana_data_source" "cloudwatch" {
  type = "cloudwatch"
  name = "SmartCanteen CloudWatch"
  uid  = "smartcanteen-cloudwatch"
  json_data_encoded = jsonencode({
    authType      = "grafana_assume_role", assumeRoleArn = var.cloudwatch_role_arn,
    defaultRegion = var.aws_region, customMetricsNamespaces = "SmartCanteen/${var.cluster_name}"
  })
}
resource "grafana_folder" "operations" {
  title = "SmartCanteen Operations"
  uid   = "smartcanteen-operations"
}
locals {
  metrics = [
    { title = "Backend availability (power ON)", namespace = "SmartCanteen/${var.cluster_name}", metric = "Availability", statistic = "Average", dimensions = { Component = "backend" }, unit = "percentunit" },
    { title = "Frontend availability (power ON)", namespace = "SmartCanteen/${var.cluster_name}", metric = "Availability", statistic = "Average", dimensions = { Component = "frontend" }, unit = "percentunit" },
    { title = "Backend CPU", namespace = "AWS/ECS", metric = "CPUUtilization", statistic = "Average", dimensions = { ClusterName = var.cluster_name, ServiceName = "${var.cluster_name}-backend" }, unit = "percent" },
    { title = "Backend memory", namespace = "AWS/ECS", metric = "MemoryUtilization", statistic = "Average", dimensions = { ClusterName = var.cluster_name, ServiceName = "${var.cluster_name}-backend" }, unit = "percent" },
    { title = "ALB target 5xx", namespace = "AWS/ApplicationELB", metric = "HTTPCode_Target_5XX_Count", statistic = "Sum", dimensions = { LoadBalancer = var.load_balancer_arn_suffix }, unit = "short" },
    { title = "ALB p95 latency", namespace = "AWS/ApplicationELB", metric = "TargetResponseTime", statistic = "p95", dimensions = { LoadBalancer = var.load_balancer_arn_suffix }, unit = "s" },
    { title = "Database free storage", namespace = "AWS/RDS", metric = "FreeStorageSpace", statistic = "Minimum", dimensions = { DBInstanceIdentifier = var.database_identifier }, unit = "bytes" },
    { title = "Scheduler heartbeat", namespace = "SmartCanteen/${var.cluster_name}", metric = "OperationsHeartbeat", statistic = "Sum", dimensions = {}, unit = "short" }
  ]
}
resource "grafana_dashboard" "operations" {
  folder = grafana_folder.operations.uid
  config_json = jsonencode({
    uid         = "smartcanteen-sre", title = "SmartCanteen Reliability", schemaVersion = 39,
    tags        = ["smartcanteen", "sre"], timezone = "Asia/Kolkata", refresh = "1m",
    time        = { from = "now-12h", to = "now" },
    description = "Availability is measured while APPLICATION_ENABLED=true. Missing samples while OFF are expected. Read the SRE runbook before assessing SLOs.",
    panels = [for i, m in local.metrics : {
      id          = i + 1, title = m.title, type = "timeseries",
      gridPos     = { x = (i % 2) * 12, y = floor(i / 2) * 8, w = 12, h = 8 },
      datasource  = { type = "cloudwatch", uid = grafana_data_source.cloudwatch.uid },
      fieldConfig = { defaults = { unit = m.unit }, overrides = [] },
      targets = [{ refId = "A", queryMode = "Metrics", metricQueryType = 0, metricEditorMode = 0,
        region     = var.aws_region, namespace = m.namespace, metricName = m.metric,
        statistic  = m.statistic, period = "60", matchExact = true,
        dimensions = { for key, value in m.dimensions : key => [value] }
      }]
    }]
  })
}
output "dashboard_url" { value = grafana_dashboard.operations.url }
