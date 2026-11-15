<#
.SYNOPSIS
  Tạo (hoặc đặt lại mật khẩu) tài khoản admin trên server, và lưu email nhận cảnh báo bảo mật.

.DESCRIPTION
  Mật khẩu được băm bcrypt ngay trên máy này; server chỉ nhận mã băm, nên mật khẩu gốc không nằm trong
  git, trong SSM hay trong lịch sử lệnh của AWS. Tài khoản admin chỉ đăng nhập được ở trang /admin/
  (POST /v1/admin/login): sai 3 lần thì IP bị chặn 24 giờ và một email báo cáo gửi tới AlertEmail.

  Cần: AWS CLI v2 đã `aws configure`, stack zenzy đã chạy, npm install trong zenzy_backend (bcryptjs),
  và API đã được deploy bản có POST /v1/admin/login (deploy.ps1).

    powershell -ExecutionPolicy Bypass -File zenzy_backend\deploy\aws\setup-admin.ps1 -Username whooduck102004 -AlertEmail you@example.com
#>
param(
  [Parameter(Mandatory = $true)][string]$Username,
  [Parameter(Mandatory = $true)][string]$AlertEmail,
  # Mật khẩu: tham số, biến môi trường ZENZY_ADMIN_PASSWORD, hoặc nhập khi chạy (ẩn).
  [string]$Password = $env:ZENZY_ADMIN_PASSWORD,
  [string]$Region = 'ap-southeast-1',
  [string]$StackName = 'zenzy'
)
$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')

$Username = $Username.Trim().ToLower()
if ($Username -notmatch '^[a-z0-9_.]{3,30}$') { throw 'Username: 3-30 characters, letters, digits, "_" or "."' }
if ($AlertEmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') { throw 'AlertEmail is not a valid e-mail address' }
if (-not $Password) {
  $sec = Read-Host "Password for admin $Username" -AsSecureString
  $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
if ($Password.Length -lt 12) { throw 'The admin password must be at least 12 characters' }

$instance = aws cloudformation describe-stacks --region $Region --stack-name $StackName `
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text
if ($LASTEXITCODE -ne 0 -or -not $instance -or $instance -eq 'None') { throw "Stack '$StackName' not found in $Region" }
$instance = $instance.Trim()

Write-Host '==> Hashing the password on this PC'
$bcryptjs = (Join-Path $repo 'zenzy_backend/node_modules/bcryptjs') -replace '\\', '/'
$env:ZENZY_PW_TMP = $Password
$hash = (node -e "process.stdout.write(require('$bcryptjs').hashSync(process.env.ZENZY_PW_TMP, 12))").Trim()
Remove-Item Env:ZENZY_PW_TMP
if ($LASTEXITCODE -ne 0 -or $hash -notmatch '^\$2[aby]\$') { throw 'Could not hash the password (run npm install in zenzy_backend)' }
$hashB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($hash))

Write-Host '==> Saving ADMIN_ALERT_EMAIL in SSM'
aws ssm put-parameter --region $Region --name /zenzy/prod/ADMIN_ALERT_EMAIL --type SecureString --value $AlertEmail --overwrite | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not save ADMIN_ALERT_EMAIL in SSM' }

Write-Host "==> Creating admin '$Username' on $instance and reloading the API"
$params = Join-Path ([IO.Path]::GetTempPath()) 'zenzy-admin-ssm.json'
$commands = @(
  'cd /opt/zenzy',
  # update.sh nạp lại bí mật từ SSM (ADMIN_ALERT_EMAIL) và khởi động lại API.
  './update.sh',
  "docker compose --env-file stack.env exec -T -e ADMIN_USERNAME=$Username -e ADMIN_PASSWORD_HASH_B64=$hashB64 api node dist/scripts/db-init.js"
)
[IO.File]::WriteAllText($params, (@{ commands = $commands } | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
$cmdId = aws ssm send-command --region $Region --instance-ids $instance --document-name AWS-RunShellScript `
  --comment 'zenzy admin setup' --parameters "file://$params" --query 'Command.CommandId' --output text
Remove-Item $params
if ($LASTEXITCODE -ne 0) { throw 'send-command failed' }
do {
  Start-Sleep -Seconds 3
  $status = aws ssm get-command-invocation --region $Region --command-id $cmdId --instance-id $instance --query 'Status' --output text 2>$null
} while ($status -in @('Pending', 'InProgress', 'Delayed', ''))
aws ssm get-command-invocation --region $Region --command-id $cmdId --instance-id $instance `
  --query '[StandardOutputContent,StandardErrorContent]' --output text
if ($status -ne 'Success') { throw "Admin setup finished with status $status" }
Write-Host "Admin '$Username' is ready. Sign in at https://<your domain>/admin/"
