$ErrorActionPreference = "Continue"

$projectPath = "C:\Users\Administrator\watch-flip-scanner"
$cloudUrl = "https://watch-flip-scanner.onrender.com"
$runScanner = Join-Path $projectPath "automation\run-scanner.ps1"
$stateFile = Join-Path $projectPath "automation\last-scan-request.txt"

$key = [Environment]::GetEnvironmentVariable(
    "NORTH_STAR_UPLOAD_KEY",
    "User"
)

if ([string]::IsNullOrWhiteSpace($key)) {
    throw "NORTH_STAR_UPLOAD_KEY is missing."
}

Write-Host "North Star scan watcher running..."

while ($true) {
    try {
        $response = Invoke-RestMethod `
            -Uri "$cloudUrl/api/scan-request" `
            -Headers @{ Authorization = "Bearer $key" } `
            -Method Get

        $requestedAt = [string]$response.requestedAt
        $lastSeen = ""

        if (Test-Path $stateFile) {
            $lastSeen = (Get-Content $stateFile -Raw).Trim()
        }

        if (
            -not [string]::IsNullOrWhiteSpace($requestedAt) -and
            $requestedAt -ne $lastSeen
        ) {
            Write-Host "New scan requested: $requestedAt"

            Set-Content $stateFile $requestedAt

            powershell `
                -ExecutionPolicy Bypass `
                -File $runScanner

            Write-Host "Scan request finished."
        }
    }
    catch {
        Write-Warning $_
    }

    Start-Sleep -Seconds 10
}