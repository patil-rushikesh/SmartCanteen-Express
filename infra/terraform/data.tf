resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.database[*].id
}
resource "aws_db_instance" "main" {
  identifier                 = local.name
  engine                     = "postgres"
  engine_version             = "16"
  instance_class             = var.database_instance_class
  allocated_storage          = 20
  max_allocated_storage      = 100
  storage_type               = "gp3"
  storage_encrypted          = true
  db_name                    = "smartcanteen"
  username                   = "canteenadmin"
  password_wo                = ephemeral.aws_ssm_parameter.database_password.value
  password_wo_version        = var.database_password_version
  db_subnet_group_name       = aws_db_subnet_group.main.name
  vpc_security_group_ids     = [aws_security_group.database.id]
  publicly_accessible        = false
  multi_az                   = var.database_multi_az
  backup_retention_period    = 7
  auto_minor_version_upgrade = true
  deletion_protection        = var.deletion_protection
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${local.name}-final"
  copy_tags_to_snapshot      = true
}
resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.database[*].id
}
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = local.name
  description                = "Shared carts and cache for all API replicas"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.cache_node_type
  num_cache_clusters         = var.high_availability ? 2 : 1
  automatic_failover_enabled = var.high_availability
  multi_az_enabled           = var.high_availability
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.cache.id]
  snapshot_retention_limit   = 7
}

# Read the SSM password only during the operation; it is omitted from state and plans.
ephemeral "aws_ssm_parameter" "database_password" {
  arn = "${local.parameter_arn_prefix}/DB_PASSWORD"
}
