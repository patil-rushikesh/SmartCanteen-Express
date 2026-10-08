resource "aws_ecr_repository" "app" {
  for_each             = local.components
  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
}
resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = local.components
  repository = aws_ecr_repository.app[each.key].name
  policy     = jsonencode({ rules = [{ rulePriority = 1, description = "Expire untagged build layers after 7 days", selection = { tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = 7 }, action = { type = "expire" } }] })
}
resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}
resource "aws_cloudwatch_log_group" "app" {
  for_each          = local.components
  name              = "/ecs/${local.name}/${each.key}"
  retention_in_days = 30
}
locals {
  backend_environment = {
    APP_ENV               = var.environment
    NODE_ENV              = "production", PORT = "8080", TRUST_PROXY_HOPS = "1"
    CORS_ORIGIN           = local.application_url
    PAYMENT_PROVIDER_MODE = var.payment_mode
    DB_HOST               = aws_db_instance.main.address, DB_NAME = aws_db_instance.main.db_name
    DB_USER               = aws_db_instance.main.username
    DB_SSL_CA             = "/app/certs/rds.pem"
    REDIS_URL             = "rediss://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
  }
  frontend_environment = {
    VITE_API_BASE_URL    = "/api"
    VITE_PAYMENT_MODE    = var.payment_mode, VITE_RAZORPAY_KEY_ID = var.razorpay_public_key
    VITE_ENABLE_QA_TOOLS = "false"
  }
  app_secret_keys = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "JWT_QR_SECRET", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]
}
resource "aws_ecs_task_definition" "app" {
  for_each                 = local.components
  family                   = "${local.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.execution[each.key].arn
  task_role_arn            = aws_iam_role.task[each.key].arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
  container_definitions = jsonencode([{
    name             = each.key
    image            = "${aws_ecr_repository.app[each.key].repository_url}:bootstrap"
    essential        = true
    stopTimeout      = 30
    linuxParameters  = { initProcessEnabled = true }
    portMappings     = [{ containerPort = 8080, protocol = "tcp" }]
    environment      = [for k, v in(each.key == "backend" ? local.backend_environment : local.frontend_environment) : { name = k, value = v }]
    secrets          = each.key == "backend" ? [for key in concat(["DB_PASSWORD"], local.app_secret_keys) : { name = key, valueFrom = "${local.parameter_arn_prefix}/${key}" }] : []
    logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.app[each.key].name, awslogs-region = var.aws_region, awslogs-stream-prefix = "ecs" } }
  }])
}
resource "aws_ecs_service" "app" {
  for_each        = local.components
  name            = "${local.name}-${each.key}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app[each.key].arn
  # First release supplies a real image and scales to the configured replica count.
  desired_count                      = 0
  enable_execute_command             = true
  launch_type                        = "FARGATE"
  platform_version                   = "1.4.0"
  health_check_grace_period_seconds  = 90
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.tasks[each.key].id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.app[each.key].arn
    container_name   = each.key
    container_port   = 8080
  }
  lifecycle { ignore_changes = [task_definition, desired_count] }
  depends_on = [aws_lb_listener.http, aws_lb_listener.https, aws_lb_listener_rule.api, aws_iam_role_policy.execution]
}
