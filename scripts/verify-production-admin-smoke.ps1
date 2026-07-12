[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$adminEmail = [Environment]::GetEnvironmentVariable('MAPLE_ADMIN_EMAIL')
$adminPassword = [Environment]::GetEnvironmentVariable('MAPLE_ADMIN_PASSWORD')
$baseUrl = [Environment]::GetEnvironmentVariable('MAPLE_PRODUCTION_URL')

if ([string]::IsNullOrWhiteSpace($adminEmail)) {
  throw 'MAPLE_ADMIN_EMAIL is required.'
}

if ([string]::IsNullOrEmpty($adminPassword)) {
  throw 'MAPLE_ADMIN_PASSWORD is required.'
}

if ([string]::IsNullOrWhiteSpace($baseUrl)) {
  $baseUrl = 'https://www.maplerentals.com.au'
}

$parsedBaseUrl = $null
if (-not [Uri]::TryCreate($baseUrl.TrimEnd('/'), [UriKind]::Absolute, [ref]$parsedBaseUrl) -or
    $parsedBaseUrl.Scheme -notin @('http', 'https') -or
    [string]::IsNullOrWhiteSpace($parsedBaseUrl.Host)) {
  throw 'MAPLE_PRODUCTION_URL must be an absolute HTTP or HTTPS URL.'
}

$baseUrl = $baseUrl.TrimEnd('/')
$sessionDirectory = Join-Path ([IO.Path]::GetTempPath()) ('maple-admin-smoke-' + [Guid]::NewGuid().ToString('N'))
$cookieJar = Join-Path $sessionDirectory 'cookies.txt'
$loginPayload = Join-Path $sessionDirectory 'login.json'
$loginResponse = Join-Path $sessionDirectory 'login-response.json'
$loginMeta = Join-Path $sessionDirectory 'login-meta.txt'
$curlError = Join-Path $sessionDirectory 'curl-error.txt'
$validator = Join-Path $PSScriptRoot 'productionAdminSmokeValidation.mjs'
$authenticated = $false
$overallSuccess = $true

function Write-Utf8File {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Invoke-Curl {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$MetadataPath
  )

  $metadata = & curl.exe @Arguments 2> $curlError
  if ($LASTEXITCODE -ne 0) {
    throw 'HTTP request transport failed.'
  }

  $metadataText = ($metadata -join '').Trim()
  $parts = $metadataText -split '\|', 2
  if ($parts.Count -ne 2 -or $parts[0] -notmatch '^\d{3}$') {
    throw 'HTTP response metadata was malformed.'
  }

  [PSCustomObject]@{
    Status = [int]$parts[0]
    ContentType = $parts[1]
  }
}

try {
  New-Item -ItemType Directory -Path $sessionDirectory -Force | Out-Null

  Write-Utf8File -Path $loginPayload -Content (@{
      username = $adminEmail.Trim().ToLowerInvariant()
      password = $adminPassword
    } | ConvertTo-Json -Compress)

  $loginResult = Invoke-Curl -MetadataPath $loginMeta -Arguments @(
    '--silent', '--show-error', '--connect-timeout', '10', '--max-time', '30',
    '--request', 'POST', '--header', 'Accept: application/json',
    '--header', 'Content-Type: application/json', '--cookie-jar', $cookieJar,
    '--data-binary', "@$loginPayload", '--output', $loginResponse,
    '--write-out', '%{http_code}|%{content_type}', "$baseUrl/api/auth/login"
  )

  if ($loginResult.Status -ne 200) {
    throw "Admin login failed with HTTP $($loginResult.Status)."
  }

  if (-not $loginResult.ContentType.ToLowerInvariant().Contains('application/json')) {
    throw 'Admin login returned a non-JSON response.'
  }

  $cookieText = [IO.File]::ReadAllText($cookieJar)
  if (-not $cookieText.Contains('admin_token')) {
    throw 'Admin login did not establish an admin session cookie.'
  }

  Remove-Item -LiteralPath $loginPayload, $loginResponse, $loginMeta -Force -ErrorAction SilentlyContinue
  $authenticated = $true

  $checks = @(
    [PSCustomObject]@{ Name = 'rentals'; Path = '/api/rentals?page=1&pageSize=25&search=' },
    [PSCustomObject]@{ Name = 'financials'; Path = '/api/financials/stats' },
    [PSCustomObject]@{ Name = 'toll-notices'; Path = '/api/toll-notices/rental-options?search=' },
    [PSCustomObject]@{ Name = 'maintenance'; Path = '/api/admin/maintenance/imported-data-reset/dry-run' },
    [PSCustomObject]@{ Name = 'applications'; Path = '/api/applications?page=1&pageSize=25&search=' }
  )

  foreach ($check in $checks) {
    $responsePath = Join-Path $sessionDirectory ("$($check.Name)-response.json")
    $metadataPath = Join-Path $sessionDirectory ("$($check.Name)-meta.txt")
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()

    try {
      $result = Invoke-Curl -MetadataPath $metadataPath -Arguments @(
        '--silent', '--show-error', '--connect-timeout', '10', '--max-time', '30',
        '--request', 'GET', '--header', 'Accept: application/json', '--cookie', $cookieJar,
        '--output', $responsePath, '--write-out', '%{http_code}|%{content_type}',
        "$baseUrl$($check.Path)"
      )
      $stopwatch.Stop()

      $validation = & node $validator --endpoint $check.Name --status $result.Status --content-type $result.ContentType --input $responsePath 2> $curlError
      if ($LASTEXITCODE -ne 0) {
        throw 'response shape validation failed.'
      }

      $validationObject = $validation -join '' | ConvertFrom-Json
      $assertions = $validationObject.assertions -join ', '
      Write-Output ("{0} | HTTP {1} | {2} ms | PASS | {3}" -f $check.Path, $result.Status, [Math]::Round($stopwatch.Elapsed.TotalMilliseconds), $assertions)
    } catch {
      $stopwatch.Stop()
      $overallSuccess = $false
      Write-Output ("{0} | {1} ms | FAIL | response validation failed" -f $check.Path, [Math]::Round($stopwatch.Elapsed.TotalMilliseconds))
    } finally {
      Remove-Item -LiteralPath $responsePath, $metadataPath -Force -ErrorAction SilentlyContinue
    }
  }
} catch {
  $overallSuccess = $false
  Write-Error $_.Exception.Message
} finally {
  if ($authenticated -and (Test-Path -LiteralPath $cookieJar)) {
    try {
      & curl.exe --silent --show-error --connect-timeout 10 --max-time 30 --request POST `
        --header "Origin: $baseUrl" --cookie $cookieJar --output NUL `
        "$baseUrl/api/auth/logout" 2> $curlError | Out-Null
    } catch {
      # Session cleanup is best effort; the temporary cookie jar is still removed below.
    }
  }

  if (Test-Path -LiteralPath $sessionDirectory) {
    Remove-Item -LiteralPath $sessionDirectory -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if (-not $overallSuccess) {
  exit 1
}

exit 0
