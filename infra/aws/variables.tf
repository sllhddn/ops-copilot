variable "name" {
  description = "Prefix for every resource"
  type        = string
  default     = "ops-copilot"
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "api_image_tag" {
  description = "Tag of the API image pushed to ECR"
  type        = string
  default     = "latest"
}

variable "web_image_tag" {
  description = "Tag of the web image pushed to ECR"
  type        = string
  default     = "latest"
}

variable "anthropic_model" {
  type    = string
  default = "claude-sonnet-4-5"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}
