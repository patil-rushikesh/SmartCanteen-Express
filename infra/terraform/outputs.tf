output "alb_dns_name" { value = aws_lb.main.dns_name }
output "application_url" { value = local.application_url }
output "cluster_name" { value = aws_ecs_cluster.main.name }
output "ecr_repositories" { value = { for k, v in aws_ecr_repository.app : k => v.repository_url } }
output "service_names" { value = { for k, v in aws_ecs_service.app : k => v.name } }
output "deploy_role_arns" { value = { for k, v in aws_iam_role.github_deploy : k => v.arn } }
output "database_endpoint" { value = aws_db_instance.main.address }
output "task_definition_templates" { value = { for k, v in aws_ecs_task_definition.app : k => v.arn } }
output "ssm_parameter_prefix" { value = local.parameter_prefix }
