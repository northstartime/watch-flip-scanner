$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $PSScriptRoot
$logFolder = Join-Path $projectPath "automation\logs"
$cloudUrl = "https://watch-flip-scanner.onrender.com"
$chromeShortcut = "$env:USERPROFILE\Desktop\North Star Chrome.lnk"

New-Item -ItemType Directory -Force -Path $logFolder | Out-Null

$timeStamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = Join-Path $logFolder "scan_$timeStamp.log"
$mutex = New-Object System.Threading.Mutex($false, "Local\NorthStarScanner")
$hasLock = $false
$transcriptStarted = $false
$exitCode = 0

try {
    $hasLock = $mutex.WaitOne(0)

    if (-not $hasLock) {
        Add-Content -Path $logFile -Value "A North Star scan is already running. This run was skipped."
        exit 0
    }

    Start-Transcript -Path $logFile
    $transcriptStarted = $true

    Set-Location $projectPath

    $env:NORTH_STAR_CLOUD_URL = $cloudUrl
    # Use the same process/.env resolver as direct Node entry points.
    # Validate before accessing or starting Chrome; do not print credentials.
    & node tools/check-upload-config.js
    if ($LASTEXITCODE -ne 0) {
        throw "Upload configuration preflight failed. No scan was started."
    }

    $chromeReady = $false

    try {
        Invoke-WebRequest `
            -Uri "http://127.0.0.1:9222/json/version" `
            -UseBasicParsing `
            -TimeoutSec 2 | Out-Null
        $chromeReady = $true
    }
  catch {
    Start-Process -FilePath $chromeShortcut -WindowStyle Hidden
}

    if (-not $chromeReady) {
        for ($attempt = 1; $attempt -le 30; $attempt++) {
            Start-Sleep -Seconds 1

            try {
                Invoke-WebRequest `
                    -Uri "http://127.0.0.1:9222/json/version" `
                    -UseBasicParsing `
                    -TimeoutSec 2 | Out-Null
                $chromeReady = $true
                break
            }
            catch {
            }
        }
    }

    if (-not $chromeReady) {
        throw "North Star Chrome did not become available on port 9222."
    }

$scanner = Start-Process `
    -FilePath (Get-Command node.exe -ErrorAction Stop).Source `
    -ArgumentList "src/daily.js" `
    -WorkingDirectory $projectPath `
    -PassThru `
    -NoNewWindow

$null = $scanner.Handle

if (-not $scanner.WaitForExit(900000)) {
    Write-Warning "Scanner exceeded 15 minutes. Killing stuck process."
    # Kill the scanner process tree, including its Playwright driver.
    & taskkill.exe /PID $scanner.Id /T /F | Out-Null
    throw "Scanner timed out after 15 minutes."
}

$scanner.Refresh()
$scannerExitCode = $scanner.ExitCode

if ($null -eq $scannerExitCode -or $scannerExitCode -ne 0) {
    throw "The scanner exited with code $scannerExitCode."
}
    Write-Host "North Star automated scan completed successfully."
}
catch {
    $exitCode = 1
    Write-Host "North Star automation failed. Review configuration and safe status checks before retrying."
}
finally {
    if ($transcriptStarted) {
        Stop-Transcript
    }

    if ($hasLock) {
        $mutex.ReleaseMutex()
    }

    $mutex.Dispose()
}

exit $exitCode
