variable "enable_prometheus" {
  type    = bool
  default = false
}
variable "grafana_metrics_write_url" {
  type    = string
  default = ""
  validation {
    condition     = !var.enable_prometheus || can(regex("^https://[a-zA-Z0-9.-]+\\.grafana\\.net/api/prom/push$", var.grafana_metrics_write_url))
    error_message = "Set the HTTPS Grafana Cloud Prometheus remote-write URL before enabling collection."
  }
}
variable "grafana_metrics_username" {
  type    = string
  default = ""
  validation {
    condition     = !var.enable_prometheus || can(regex("^[0-9]+$", var.grafana_metrics_username))
    error_message = "Set the numeric Grafana Cloud metrics instance ID."
  }
}
variable "prometheus_image" {
  type    = string
  default = "prom/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e"
}
locals {
  prometheus_config = yamlencode({
    global = {
      scrape_interval = "30s"
      external_labels = { application = "smartcanteen", environment = var.environment, collector = "$HOSTNAME" }
    }
    scrape_configs = [{
      job_name       = "smartcanteen-backend"
      static_configs = [{ targets = ["127.0.0.1:9091"] }]
      sample_limit   = 10000
    }]
    remote_write = [{
      url          = var.grafana_metrics_write_url
      basic_auth   = { username = var.grafana_metrics_username, password_file = "/prometheus/write-token" }
      queue_config = { max_shards = 2, capacity = 2500, max_samples_per_send = 500 }
    }]
  })
  prometheus_container = {
    name              = "prometheus"
    image             = var.prometheus_image
    essential         = false
    restartPolicy     = { enabled = true, ignoredExitCodes = [0], restartAttemptPeriod = 60 }
    memory            = 256
    memoryReservation = 128
    stopTimeout       = 60
    user              = "65534:65534"
    entryPoint        = ["/bin/sh", "-ec"]
    command = [<<-SCRIPT
      umask 077
      printf '%s' "$GRAFANA_METRICS_WRITE_TOKEN" > /prometheus/write-token
      unset GRAFANA_METRICS_WRITE_TOKEN
      printf '%s' '${base64encode(local.prometheus_config)}' | base64 -d > /prometheus/prometheus.yml
      export HOSTNAME="$(hostname)"
      exec /bin/prometheus --config.file=/prometheus/prometheus.yml --storage.tsdb.path=/prometheus/data --storage.tsdb.retention.time=2h --storage.tsdb.retention.size=256MB --web.listen-address=127.0.0.1:9090
    SCRIPT
    ]
    secrets          = [{ name = "GRAFANA_METRICS_WRITE_TOKEN", valueFrom = "${local.parameter_arn_prefix}/GRAFANA_METRICS_WRITE_TOKEN" }]
    logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.app["backend"].name, awslogs-region = var.aws_region, awslogs-stream-prefix = "prometheus" } }
  }
}
