output "url" {
  description = "Open this in a browser once the service is healthy"
  value       = "http://${aws_lb.this.dns_name}"
}

output "api_repository" {
  value = aws_ecr_repository.api.repository_url
}

output "web_repository" {
  value = aws_ecr_repository.web.repository_url
}

output "anthropic_secret_name" {
  value = aws_secretsmanager_secret.anthropic.name
}
