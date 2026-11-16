# CivicPulse — Terraform Application Server Configuration
# Course: INT333 DevOps Advance Configuration Management (LPU)
# Student: Sachin Kumar (Reg: 12316496)
# Provisions ONE t3.small EC2 Instance in existing VPC & Subnet with dedicated Security Group

provider "aws" {
  region = var.aws_region
}

# ── 1. Ubuntu 24.04 LTS Canonical AMI ──────────────────────────────────────────

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ── 2. Dedicated Security Group ───────────────────────────────────────────────
# Inbound:
#   - Port 22: Ansible & Terraform management servers only
#   - Port 80: HTTP public
#   - Port 443: HTTPS public
#   - Port 5666: Nagios NRPE monitoring from Nagios private IP only
# Outbound:
#   - All traffic allowed for package installation and Docker Hub pulls

resource "aws_security_group" "app" {
  name        = "civicpulse-app-sg"
  description = "Security group for CivicPulse application server"
  vpc_id      = var.vpc_id

  ingress {
    description = "SSH from Ansible and Terraform management servers"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [
      var.ansible_server_ip,
      var.ansible_server_public_ip,
      var.terraform_server_ip
    ]
  }

  ingress {
    description = "HTTP traffic for Web and Caddy reverse proxy"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS traffic for Web and Caddy reverse proxy"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Nagios NRPE check from Nagios management server only"
    from_port   = 5666
    to_port     = 5666
    protocol    = "tcp"
    cidr_blocks = [var.nagios_server_ip]
  }

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "civicpulse-app-sg"
    Environment = var.environment
    Project     = "CivicPulse"
  }
}

# ── 3. Single Application EC2 Instance ────────────────────────────────────────

resource "aws_instance" "app" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [aws_security_group.app.id]
  key_name                    = var.key_name
  associate_public_ip_address = true

  # Enforce IMDSv2 for security
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  # 20 GB gp3 root volume
  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size
    delete_on_termination = true
    encrypted             = true
  }

  # Bootstrap: create 2GB swap immediately to prevent OOM on 2GB RAM t3.small
  user_data = <<-EOF
              #!/bin/bash
              set -euo pipefail
              
              if ! grep -q "swapfile" /etc/fstab; then
                fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
                chmod 600 /swapfile
                mkswap /swapfile
                swapon /swapfile
                echo '/swapfile none swap sw 0 0' >> /etc/fstab
                sysctl vm.swappiness=20
                echo 'vm.swappiness=20' >> /etc/sysctl.conf
              fi

              apt-get update -y
              apt-get install -y ca-certificates curl gnupg lsb-release
              EOF

  tags = {
    Name        = "civicpulse-app-server"
    Environment = var.environment
    Project     = "CivicPulse"
  }
}
