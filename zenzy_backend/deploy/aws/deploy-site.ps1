<#
.SYNOPSIS
  Build bản web Flutter + APK release, đưa lên EC2 và cập nhật Caddy để phục vụ:
    https://DOMAIN/            bản web (giao diện điện thoại)
    https://DOMAIN/download/   trang tải APK (file: /download/zenzy.apk)

.DESCRIPTION
  Cần: Flutter, AWS CLI v2 đã `aws configure`, stack từ zenzy-stack.yaml (có MediaBucket), và
  zenzy_frontend/android/key.properties + app/zenzy-release.jks để ký APK.
  Gói site được tải lên s3://<MediaBucket>/site-deploy/ (riêng tư), máy chủ tải về bằng URL có chữ ký
  15 phút qua SSM Run Command. Không cần SSH.

    powershell -ExecutionPolicy Bypass -File zenzy_backend\deploy\aws\deploy-site.ps1
    powershell -ExecutionPolicy Bypass -File zenzy_backend\deploy\aws\deploy-site.ps1 -SkipBuild   # dùng bản build có sẵn
#>
param(
  [string]$Region = 'ap-southeast-1',
  [string]$StackName = 'zenzy',
  [string]$GoogleWebClientId = '295741052942-88iii8ju97el1jaoik478jrtmqm21pva.apps.googleusercontent.com',
  # Tài khoản bảo vệ trang /download/ (basic auth). Mật khẩu: tham số, biến môi trường ZENZY_DOWNLOAD_PASSWORD,
  # hoặc nhập khi chạy. Chỉ mã băm bcrypt được gửi lên máy chủ.
  [string]$DownloadUser = 'huuduc',
  [string]$DownloadPassword = $env:ZENZY_DOWNLOAD_PASSWORD,
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$front = Join-Path $repo 'zenzy_frontend'
$siteSrc = Join-Path $PSScriptRoot '..\site'

function Get-Output([string]$key) {
  $v = aws cloudformation describe-stacks --region $Region --stack-name $StackName `
    --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" --output text
  if ($LASTEXITCODE -ne 0 -or -not $v -or $v -eq 'None') { throw "Stack output $key not found" }
  return $v.Trim()
}
$instance = Get-Output 'InstanceId'
$bucket = Get-Output 'MediaBucketName'
$apiBase = (Get-Output 'ApiBaseUrl').TrimEnd('/')
$siteUrl = $apiBase -replace '/v1$', ''

if (-not $SkipBuild) {
  if (-not (Test-Path (Join-Path $front 'android\key.properties'))) { throw 'android/key.properties not found: the APK would be signed with the debug key' }
  Push-Location $front
  try {
    Write-Host '==> flutter build web'
    flutter build web --release "--dart-define=GOOGLE_WEB_CLIENT_ID=$GoogleWebClientId"
    if ($LASTEXITCODE -ne 0) { throw 'flutter build web failed' }
    Write-Host '==> flutter build apk'
    # Một APK cho mỗi kiến trúc: bản arm64 (gần như mọi điện thoại hiện nay) nhẹ hơn bản gộp ~2,5 lần.
    flutter build apk --release --split-per-abi --target-platform android-arm,android-arm64 `
      "--dart-define=API_BASE_URL=$apiBase" "--dart-define=GOOGLE_WEB_CLIENT_ID=$GoogleWebClientId"
    if ($LASTEXITCODE -ne 0) { throw 'flutter build apk failed' }
  } finally { Pop-Location }
}

$web = Join-Path $front 'build\web'
$apkDir = Join-Path $front 'build\app\outputs\flutter-apk'
$apk = Join-Path $apkDir 'app-arm64-v8a-release.apk'
$apk32 = Join-Path $apkDir 'app-armeabi-v7a-release.apk'
if (-not (Test-Path (Join-Path $web 'index.html'))) { throw "Missing $web" }
if (-not (Test-Path $apk) -or -not (Test-Path $apk32)) { throw "Missing split APKs in $apkDir (build with --split-per-abi)" }

Write-Host '==> Packing site'
$stage = Join-Path ([IO.Path]::GetTempPath()) ("zenzy-site-" + [guid]::NewGuid().ToString('N'))
$srv = Join-Path $stage 'srv'
New-Item -ItemType Directory -Force (Join-Path $srv 'download') | Out-Null
Copy-Item -Recurse $web (Join-Path $srv 'web')
Copy-Item $apk (Join-Path $srv 'download\zenzy.apk')
Copy-Item $apk32 (Join-Path $srv 'download\zenzy-armv7.apk')
$version = ((Get-Content (Join-Path $front 'pubspec.yaml') | Select-String '^version:\s*(\S+)').Matches[0].Groups[1].Value)
$sizeMb = '{0:N0}' -f ((Get-Item $apk).Length / 1MB)
$size32 = '{0:N0}' -f ((Get-Item $apk32).Length / 1MB)
$page = (Get-Content -Raw -Encoding UTF8 (Join-Path $siteSrc 'download\index.html')).
  Replace('__VERSION__', $version).Replace('__SIZE__', $sizeMb).Replace('__SIZE32__', $size32).Replace('__DATE__', (Get-Date -Format 'dd/MM/yyyy'))
[IO.File]::WriteAllText((Join-Path $srv 'download\index.html'), $page, (New-Object Text.UTF8Encoding $false))
# Mật khẩu trang tải: băm bcrypt ngay trên máy này (bcryptjs của backend), máy chủ chỉ nhận mã băm.
if (-not $DownloadPassword) {
  $sec = Read-Host "Password for $DownloadUser on /download/" -AsSecureString
  $DownloadPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
if (-not $DownloadPassword) { throw 'A password for the download page is required' }
if ($DownloadUser -notmatch '^[A-Za-z0-9._-]+$') { throw 'DownloadUser may only contain letters, digits, dot, dash and underscore' }
$bcryptjs = (Join-Path $repo 'zenzy_backend/node_modules/bcryptjs') -replace '\\', '/'
$env:ZENZY_PW_TMP = $DownloadPassword
$downloadHash = (node -e "process.stdout.write(require('$bcryptjs').hashSync(process.env.ZENZY_PW_TMP, 10))").Trim()
Remove-Item Env:ZENZY_PW_TMP
if ($LASTEXITCODE -ne 0 -or $downloadHash -notmatch '^\$2[aby]\$') { throw 'Could not hash the download password (run npm install in zenzy_backend)' }

# API kiểm tra mật khẩu trang tải (Caddy forward_auth -> /v1/internal/download-auth, tối đa 10 lần sai mỗi IP).
# Mã băm lưu base64 trong SSM để ký tự "$" không bị file env của docker compose hiểu nhầm.
Write-Host '==> Saving the download password hash in SSM'
$hashB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($downloadHash))
aws ssm put-parameter --region $Region --name /zenzy/prod/DOWNLOAD_USER --type String --value $DownloadUser --overwrite | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not save DOWNLOAD_USER in SSM' }
aws ssm put-parameter --region $Region --name /zenzy/prod/DOWNLOAD_PASSWORD_HASH_B64 --type SecureString --value $hashB64 --overwrite | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not save DOWNLOAD_PASSWORD_HASH_B64 in SSM' }

# Unix line endings cho file chạy trên Linux.
foreach ($f in 'Caddyfile', 'setup.sh') {
  $t = (Get-Content -Raw (Join-Path $siteSrc $f)) -replace "`r`n", "`n"
  [IO.File]::WriteAllText((Join-Path $stage $f), $t, (New-Object Text.UTF8Encoding $false))
}
$tgz = "$stage.tgz"
tar -czf $tgz -C $stage .
if ($LASTEXITCODE -ne 0) { throw 'tar failed' }
Write-Host ('    {0:N1} MB' -f ((Get-Item $tgz).Length / 1MB))

Write-Host "==> Uploading to s3://$bucket/site-deploy/"
$key = 'site-deploy/zenzy-site.tgz'
aws s3 cp $tgz "s3://$bucket/$key" --region $Region --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'S3 upload failed' }
$url = (aws s3 presign "s3://$bucket/$key" --region $Region --expires-in 900).Trim()

Write-Host "==> Installing on $instance (SSM Run Command)"
$params = Join-Path ([IO.Path]::GetTempPath()) 'zenzy-site-ssm.json'
$commands = @(
  # Nạp lại bí mật từ SSM (mật khẩu trang tải) và khởi động lại API trước khi Caddy chuyển /download cho nó.
  '/opt/zenzy/update.sh',
  "curl -fsSL '$url' -o /tmp/zenzy-site.tgz",
  'tar -xzOf /tmp/zenzy-site.tgz ./setup.sh | bash'
)
[IO.File]::WriteAllText($params, (@{ commands = $commands } | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
$cmdId = aws ssm send-command --region $Region --instance-ids $instance --document-name AWS-RunShellScript `
  --comment 'zenzy site deploy' --parameters "file://$params" --query 'Command.CommandId' --output text
if ($LASTEXITCODE -ne 0) { throw 'send-command failed' }
do {
  Start-Sleep -Seconds 3
  $status = aws ssm get-command-invocation --region $Region --command-id $cmdId --instance-id $instance --query 'Status' --output text 2>$null
} while ($status -in @('Pending', 'InProgress', 'Delayed', ''))
aws ssm get-command-invocation --region $Region --command-id $cmdId --instance-id $instance `
  --query '[StandardOutputContent,StandardErrorContent]' --output text
aws s3 rm "s3://$bucket/$key" --region $Region --only-show-errors
Remove-Item -Recurse -Force $stage, $tgz, $params
if ($status -ne 'Success') { throw "Site install finished with status $status" }

Write-Host '==> Checking'
$basic = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${DownloadUser}:$DownloadPassword"))
foreach ($p in '/', '/download/', '/download/zenzy.apk', '/download/zenzy-armv7.apk', '/health') {
  $h = if ($p -like '/download*') { @{ Authorization = $basic } } else { @{} }
  $r = Invoke-WebRequest -Uri "$siteUrl$p" -Method Head -Headers $h -UseBasicParsing -TimeoutSec 20
  Write-Host ("    {0} {1} {2}" -f $r.StatusCode, $p, $r.Headers['Content-Type'])
}
try {
  Invoke-WebRequest -Uri "$siteUrl/download/" -Method Head -UseBasicParsing -TimeoutSec 20 | Out-Null
  throw '/download/ answered without a password'
} catch [System.Net.WebException] {
  Write-Host ("    {0} /download/ without password (expected 401)" -f [int]$_.Exception.Response.StatusCode)
}
Write-Host "Web:      $siteUrl/"
Write-Host "Download: $siteUrl/download/"
