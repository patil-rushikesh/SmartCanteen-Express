locals {
  ecs_trust           = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }] })
  github_repositories = { backend = var.github_backend_repository, frontend = var.github_frontend_repository }
}
resource "aws_iam_role" "execution" {
  for_each           = local.components
  name               = "${local.name}-${each.key}-execution"
  assume_role_policy = local.ecs_trust
}
resource "aws_iam_role" "task" {
  for_each           = local.components
  name               = "${local.name}-${each.key}-task"
  assume_role_policy = local.ecs_trust
}
resource "aws_iam_role_policy" "execution" {
  for_each = local.components
  role     = aws_iam_role.execution[each.key].id
  policy = jsonencode({ Version = "2012-10-17", Statement = concat([
    { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
    { Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"], Resource = aws_ecr_repository.app[each.key].arn },
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.app[each.key].arn}:*" }
    ], each.key == "backend" ? [
    { Effect = "Allow", Action = ["ssm:GetParameters"], Resource = ["${local.parameter_arn_prefix}/*"] }
  ] : []) })
}
resource "aws_iam_role" "github_deploy" {
  for_each           = local.components
  name               = "${local.name}-${each.key}-deploy"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Federated = var.github_oidc_provider_arn }, Action = "sts:AssumeRoleWithWebIdentity", Condition = { StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com", "token.actions.githubusercontent.com:sub" = "repo:${local.github_repositories[each.key]}:environment:${var.github_environment}" } } }] })
}
resource "aws_iam_role_policy" "github_deploy" {
  for_each = local.components
  role     = aws_iam_role.github_deploy[each.key].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["lambda:GetFunctionConfiguration"], Resource = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.name}-operations" },
    { Effect = "Allow", Action = ["ecr:GetAuthorizationToken", "ecs:RegisterTaskDefinition", "ecs:DescribeTaskDefinition"], Resource = "*" },
    { Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:DescribeImages"], Resource = aws_ecr_repository.app[each.key].arn },
    { Effect = "Allow", Action = ["ecs:DescribeServices", "ecs:UpdateService"], Resource = aws_ecs_service.app[each.key].id },
    { Effect = "Allow", Action = ["ecs:RunTask"], Resource = "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:task-definition/${local.name}-${each.key}:*", Condition = { ArnEquals = { "ecs:cluster" = aws_ecs_cluster.main.arn } } },
    { Effect = "Allow", Action = ["ecs:DescribeTasks", "ecs:StopTask"], Resource = "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:task/${local.name}/*" },
    { Effect = "Allow", Action = ["iam:PassRole"], Resource = [aws_iam_role.execution[each.key].arn, aws_iam_role.task[each.key].arn], Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } } }
  ] })
}

resource "aws_iam_role_policy" "ecs_exec" {
  for_each = local.components
  role     = aws_iam_role.task[each.key].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect   = "Allow"
    Action   = ["ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel"]
    Resource = "*"
  }] })
}
