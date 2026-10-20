variable "prometheus_datasource_uid" {
  description = "UID of the existing Grafana Cloud managed Prometheus datasource; empty disables panels."
  type        = string
  default     = ""
}
variable "environment" {
  type    = string
  default = "exam"
}
locals {
  prom_selector = "job=\"smartcanteen-backend\",application=\"smartcanteen\",environment=\"${var.environment}\""
  prometheus_panels = [
    { title = "Prometheus scrape health", unit = "short", expr = "up{${local.prom_selector}}" },
    { title = "API requests per second", unit = "reqps", expr = "sum(rate(smartcanteen_http_requests_total{${local.prom_selector}}[$__rate_interval]))" },
    { title = "API 5xx error percentage", unit = "percent", expr = "100 * (sum(rate(smartcanteen_http_requests_total{${local.prom_selector},status_code=~\"5..\"}[$__rate_interval])) or vector(0)) / sum(rate(smartcanteen_http_requests_total{${local.prom_selector}}[$__rate_interval]))" },
    { title = "API p95 duration", unit = "s", expr = "histogram_quantile(0.95, sum by (le) (rate(smartcanteen_http_request_duration_seconds_bucket{${local.prom_selector}}[$__rate_interval])))" },
    { title = "Node.js resident memory per task", unit = "bytes", expr = "smartcanteen_process_resident_memory_bytes{${local.prom_selector}}" },
    { title = "Node.js event loop lag per task", unit = "s", expr = "smartcanteen_nodejs_eventloop_lag_seconds{${local.prom_selector}}" }
  ]
}
