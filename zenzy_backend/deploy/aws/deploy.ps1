<#
.SYNOPSIS
  Builds the Zenzy API image, pushes it to ECR, and restarts the API on the EC2 instance.

.DESCRIPTION
  Needs: Docker Desktop running, AWS CLI v2 configured (aws configure), and the CloudFormation
  stack from zenzy-stack.yaml already created. Run from anywhere:

    powershell -ExecutionPolicy Bypass -File server\deploy\aws\deploy.ps1
    powershell -ExecutionPolicy Bypass -File server\deploy\aws\deploy.ps1 -Region ap-southeast-1 -StackName zenzy
#>
param(
  [string]$Region = 'ap-southeast-1',
  [string]$StackName = 'zenzy'
)
$ErrorActionPreference = 'Stop'
$serverDir = Resolve-Path (Join-Path $PSScriptRoot '..\..')

function Get-Output([string]$key) {
  $v = aws cloudformation describe-stacks --region $Region --stack-name $StackName `
    --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" --output text
  if ($LASTEXITCODE -ne 0 -or -not $v -or $v -eq 'None') { throw "Stack output $key not found (is the stack '$StackName' created in $Region?)" }
  return $v.Trim()
}

$repo = Get-Output 'RepositoryUri'
$instance = Get-Output 'InstanceId'
$health = Get-Output 'HealthUrl'
$tag = (Get-Date -Format 'yyyyMMdd-HHmmss')

Write-Host "==> Building image $repo`:$tag"
docker build --platform linux/amd64 -t "$repo`:$tag" -t "$repo`:latest" $serverDir
if ($LASTEXITCODE -ne 0) { throw 'docker build failed' }

Write-Host '==> Logging in to ECR and pushing'
$registry = $repo.Split('/')[0]
$ecrPassword = aws ecr get-login-password --region $Region
cmd /c "docker login --username AWS --password $ecrPassword $registry 2>nul"
if ($LASTEXITCODE -ne 0) { throw 'ECR login failed' }
docker push "$repo`:$tag"; if ($LASTEXITCODE -ne 0) { throw 'push failed' }
docker push "$repo`:latest"; if ($LASTEXITCODE -ne 0) { throw 'push failed' }

Write-Host "==> Restarting the API on $instance (SSM Run Command)"
$cmdId = aws ssm send-command --region $Region --instance-ids $instance --document-name AWS-RunShellScript `
  --comment "zenzy deploy $tag" --parameters 'commands=["/opt/zenzy/update.sh"]' --query 'Command.CommandId' --output text
if ($LASTEXITCODE -ne 0) { throw 'send-command failed' }

do {
  Start-Sleep -Seconds 3
  $status = aws ssm get-command-invocation --region $Region --command-id $cmdId --instance-id $instance --query 'Status' --output text 2>$null
} while ($status -in @('Pending', 'InProgress', 'Delayed', ''))

aws ssm get-command-invocation --region $Region --command-id $cmdId --instance-id $instance `
  --query '[StandardOutputContent,StandardErrorContent]' --output text
if ($status -ne 'Success') { throw "update.sh finished with status $status" }

Write-Host "==> Waiting for $health"
for ($i = 0; $i -lt 20; $i++) {
  try {
    $r = Invoke-RestMethod -Uri $health -TimeoutSec 10
    if ($r.status -eq 'ok') { Write-Host "API is up: $health"; exit 0 }
  } catch { Start-Sleep -Seconds 6 }
}
throw "Health check did not pass. On the first deploy the HTTPS certificate can take a minute; also check that the DNS record points to the Elastic IP."
