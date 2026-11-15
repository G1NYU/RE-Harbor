param(
    [Parameter(Mandatory=$true)][string]$Harness,
    [Parameter(Mandatory=$true)][string]$Worker
)
$ErrorActionPreference = 'Stop'
$root = Join-Path ([System.IO.Path]::GetTempPath()) ("harbor-8spine-" + [guid]::NewGuid().ToString("N"))
$listener = $null
try {
    New-Item -ItemType Directory -Path $root | Out-Null
    $bin = Join-Path $root "worker"
    New-Item -ItemType Directory -Path $bin | Out-Null
    $copy = Join-Path $bin "harbor-8spine-native-poc.exe"
    Copy-Item -LiteralPath $Worker -Destination $copy
    $sentinel = Join-Path $root "host-only.txt"
    [System.IO.File]::WriteAllText($sentinel, "synthetic test sentinel")
    if ([System.IO.File]::ReadAllText($sentinel) -ne "synthetic test sentinel") { throw "Host file baseline failed" }
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $client.Connect([System.Net.IPAddress]::Loopback, $port)
        $accepted = $listener.AcceptTcpClient()
        $accepted.Dispose()
    } finally { $client.Dispose() }
    $lines = @(& $Harness $copy $sentinel $port)
    if ($LASTEXITCODE -ne 0) { throw "AppContainer harness exit $LASTEXITCODE" }
    if ($lines.Count -ne 2) { throw "Expected two fixture envelopes" }
    $probe = $lines[0] | ConvertFrom-Json
    $catalog = $lines[1] | ConvertFrom-Json
    if ($probe.ok -ne $true -or $probe.result.hostFileReadable -ne $false -or
        $probe.result.hostNetworkReachable -ne $false -or $probe.result.pathPresent -ne $false) {
        throw "AppContainer containment assertion failed"
    }
    if ($listener.Pending()) { throw "Unexpected connection to the host listener" }
    if ($catalog.ok -ne $true -or $catalog.result.tracks.Count -ne 1 -or $catalog.result.tracks[0].id -ne 42) {
        throw "Confined music fixture search failed"
    }
    if ([System.IO.File]::ReadAllText($sentinel) -ne "synthetic test sentinel") { throw "Host file was modified" }
    Write-Host "AppContainer token check, filesystem denial, loopback denial and confined music search passed"
} finally {
    if ($null -ne $listener) { $listener.Stop() }
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
