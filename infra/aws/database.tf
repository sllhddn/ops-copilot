resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = data.aws_subnets.default.ids
}

# RDS PostgreSQL 16 supports the pgvector extension; the first migration runs CREATE EXTENSION vector.
resource "aws_db_instance" "this" {
  identifier              = var.name
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = var.db_instance_class
  allocated_storage       = 20
  storage_encrypted       = true
  db_name                 = "opscopilot"
  username                = "opscopilot"
  password                = random_password.db.result
  db_subnet_group_name    = aws_db_subnet_group.this.name
  vpc_security_group_ids  = [aws_security_group.db.id]
  publicly_accessible     = false
  backup_retention_period = 7
  skip_final_snapshot     = true # demo; set false and add final_snapshot_identifier for real data
}

resource "aws_secretsmanager_secret" "database_url" {
  name = "${var.name}/database-url"
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgres://opscopilot:${random_password.db.result}@${aws_db_instance.this.address}:5432/opscopilot?sslmode=no-verify"
}

# Starts as "offline" (the app then uses its built-in offline model). Put the real key in by hand,
# so it never appears in Terraform state; ignore_changes stops Terraform from reverting it:
#   aws secretsmanager put-secret-value --secret-id ops-copilot/anthropic-api-key --secret-string sk-ant-...
resource "aws_secretsmanager_secret" "anthropic" {
  name = "${var.name}/anthropic-api-key"
}

resource "aws_secretsmanager_secret_version" "anthropic" {
  secret_id     = aws_secretsmanager_secret.anthropic.id
  secret_string = "offline"
  lifecycle { ignore_changes = [secret_string] }
}
