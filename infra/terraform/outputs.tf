# CivicPulse — Terraform Outputs

output "instance_id" {
  description = "EC2 Instance ID of the CivicPulse Application Server"
  value       = aws_instance.app.id
}

output "public_ip" {
  description = "Public IPv4 address of the CivicPulse Application Server"
  value       = aws_instance.app.public_ip
}

output "private_ip" {
  description = "Private IPv4 address in VPC for Ansible and Nagios communication"
  value       = aws_instance.app.private_ip
}

output "ssh_command_private" {
  description = "SSH command from inside VPC (e.g. from Ansible management server)"
  value       = "ssh -i ~/.ssh/${var.key_name}.pem ubuntu@${aws_instance.app.private_ip}"
}

output "ssh_command_public" {
  description = "SSH command from authorized management public IPs"
  value       = "ssh -i ~/.ssh/${var.key_name}.pem ubuntu@${aws_instance.app.public_ip}"
}
