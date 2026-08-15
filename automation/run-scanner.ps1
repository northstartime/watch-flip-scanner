$ErrorActionPreference = "Stop"

$projectPath = "C:\Users\woodm\watch-flip-scanner"
$logFolder = Join-Path $projectPath "automation\logs"
$cloudUrl = "https://watch-flip-scanner.onrender.com"
$chromeShortcut = "$env:USERPROFILE\Desktop\North Star Chrome.lnk"
$modaUrl = "https://www.facebook.com/groups/558871041349029/?sorting_setting=CHRONOLOGICAL"

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
    $env:NORTH_STAR_UPLOAD_KEY = [Environment]::GetEnvironmentVariable(
        "NORTH_STAR_UPLOAD_KEY",
        "User"
    )

    if ([string]::IsNullOrWhiteSpace($env:NORTH_STAR_UPLOAD_KEY)) {
        throw "NORTH_STAR_UPLOAD_KEY is missing from the Windows user environment."
    }

    $chromeReady = $false
    $startedChrome = $false

    try {
        Invoke-WebRequest `
            -Uri "http://127.0.0.1:9222/json/version" `
            -UseBasicParsing `
            -TimeoutSec 2 | Out-Null
        $chromeReady = $true
    }
  catch {
    Start-Process $chromeShortcut
    $startedChrome = $true
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

 if ($startedChrome) {
    Start-Process `
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" `
        -ArgumentList @(
            "--remote-debugging-port=9222",
            '--user-data-dir=C:\NorthStarChromeProfile',
            $modaUrl
        )

    Start-Sleep -Seconds 8
}

    & npm.cmd start

  if ($LASTEXITCODE -notin @(0, -1073740791)) {
        throw "The scanner exited with code $LASTEXITCODE."
    }

    Write-Host "North Star automated scan completed successfully."
}
catch {
    $exitCode = 1
    Write-Error $_
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