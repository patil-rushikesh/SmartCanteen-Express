# Preconditions fail the plan; a check block alone would only warn.
resource "terraform_data" "production_guard" {
  lifecycle {
    precondition {
      condition = var.environment != "production" || (
        var.enable_https && var.domain_name != "" && var.certificate_arn != "" &&
        var.high_availability && var.database_multi_az && var.deletion_protection &&
        var.payment_mode == "razorpay" && var.github_environment == "production" &&
        var.alert_email != "" && var.daytime_replicas >= 2
      )
      error_message = "Production requires HTTPS, domain/certificate, HA, Multi-AZ DB, deletion protection, real payments, production GitHub environment, alert email, and two replicas."
    }
  }
}
