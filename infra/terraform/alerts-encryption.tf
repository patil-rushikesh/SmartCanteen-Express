resource "aws_kms_key" "alerts" {
  description             = "Encrypt ${local.name} operational alerts"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  # In a KMS key policy Resource '*' means this key, not every key in the account.
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Sid = "AccountAdministration", Effect = "Allow", Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }, Action = "kms:*", Resource = "*" },
    { Sid = "CloudWatchAlarmEncryption", Effect = "Allow", Principal = { Service = "cloudwatch.amazonaws.com" }, Action = ["kms:GenerateDataKey*", "kms:Decrypt"], Resource = "*",
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id },
        ArnLike      = { "aws:SourceArn" = "arn:aws:cloudwatch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:${local.name}-*" }
      }
    }
  ] })
}
resource "aws_sns_topic_policy" "operations" {
  arn = aws_sns_topic.operations.arn
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Sid = "CloudWatchAlarmPublish", Effect = "Allow", Principal = { Service = "cloudwatch.amazonaws.com" }, Action = "sns:Publish", Resource = aws_sns_topic.operations.arn,
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id },
        ArnLike      = { "aws:SourceArn" = "arn:aws:cloudwatch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:${local.name}-*" }
      }
    }
  ] })
}
