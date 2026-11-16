variable "aws_region" {
  type        = string
  description = "AWS region for deployment"
  default     = "ap-south-1"
}

variable "environment" {
  type        = string
  description = "Deployment environment name"
  default     = "prod"
}

variable "vpc_id" {
  type        = string
  description = "Existing AWS VPC ID"
  default     = "vpc-081589d1cdadacdf0"
}

variable "subnet_id" {
  type        = string
  description = "Existing AWS Subnet ID for the application server"
  default     = "subnet-09431ac51099cb628"
}

variable "key_name" {
  type        = string
  description = "Existing AWS Key Pair name"
  default     = "aws"
}

variable "instance_type" {
  type        = string
  description = "EC2 instance type (t3.small: 2 vCPU, 2 GB RAM)"
  default     = "t3.small"
}

variable "root_volume_size" {
  type        = number
  description = "Size of the gp3 root EBS volume in GB"
  default     = 20
}

variable "ansible_server_ip" {
  type        = string
  description = "Private IP CIDR of existing Ansible management server"
  default     = "172.31.4.105/32"
}

variable "ansible_server_public_ip" {
  type        = string
  description = "Public IP CIDR of existing Ansible management server"
  default     = "15.252.108.248/32"
}

variable "terraform_server_ip" {
  type        = string
  description = "Private IP CIDR of existing Terraform management server"
  default     = "172.31.3.124/32"
}

variable "nagios_server_ip" {
  type        = string
  description = "Private IP CIDR of existing Nagios monitoring server"
  default     = "172.31.9.205/32"
}

variable "domain" {
  type        = string
  description = "DuckDNS domain for the application (e.g. civicpulse.duckdns.org)"
  default     = "civicpulse.duckdns.org"
}
