# Deploying ops-copilot to AWS

Creates: ECR repositories, an ECS Fargate service (API + web in one task) behind an Application Load Balancer,
RDS PostgreSQL 16 (pgvector), Secrets Manager entries and a CloudWatch log group.

**This costs money while it runs** (RDS, Fargate, ALB). Destroy it when you are done: `terraform destroy`.

```bash
cd infra/aws
terraform init
terraform apply -target=aws_ecr_repository.api -target=aws_ecr_repository.web   # repositories first

# Build and push the images (replace ACCOUNT and REGION)
aws ecr get-login-password | docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.REGION.amazonaws.com
docker build -t ACCOUNT.dkr.ecr.REGION.amazonaws.com/ops-copilot-api:latest ../../api
docker build -t ACCOUNT.dkr.ecr.REGION.amazonaws.com/ops-copilot-web:latest ../../web
docker push ACCOUNT.dkr.ecr.REGION.amazonaws.com/ops-copilot-api:latest
docker push ACCOUNT.dkr.ecr.REGION.amazonaws.com/ops-copilot-web:latest

terraform apply                                    # everything else
terraform output url                               # works now, with the offline model

# Optional: switch to Claude
aws secretsmanager put-secret-value --secret-id ops-copilot/anthropic-api-key --secret-string "sk-ant-..."
aws ecs update-service --cluster ops-copilot --service ops-copilot --force-new-deployment
```

The Anthropic secret starts with the value `offline`, which the API treats as "no key". Seed the demo data once
with a one-off task (`aws ecs run-task` with the command override `node dist/seed/seed.js`) or add your own runbooks
in the Documents tab.

Design notes: see [docs/DESIGN.md](../../docs/DESIGN.md#deployment).
