# Experimental OK.ru smoke test. No session IDs or signed URLs are printed.
param([string]$Query = "Kate Bush")
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

function Get-OkResponse {
    param([System.Net.Http.HttpClient]$Client, [string]$Session, [string]$Route, [hashtable]$Parameters, [switch]$CookieAuth)
    if ($Route -notin @("tracks", "play")) { throw "Unexpected diagnostic route." }
    $parts = @()
    foreach ($key in $Parameters.Keys) {
        $parts += ([Uri]::EscapeDataString([string]$key) + "=" + [Uri]::EscapeDataString([string]$Parameters[$key]))
    }
    # The legacy WMF API expects a URL session. Test a normal Cookie header as
    # an alternative only after it explicitly rejects the URL session.
    if ($CookieAuth) {
        $url = "https://wmf.ok.ru/$Route?" + [string]::Join("&", $parts)
    } else {
        $url = "https://wmf.ok.ru/$Route;jsessionid=$Session?" + [string]::Join("&", $parts)
    }
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $url)
    if ($CookieAuth) {
        $null = $request.Headers.TryAddWithoutValidation("Cookie", "JSESSIONID=$Session")
    }
    $null = $request.Headers.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0")
    try {
        try {
            $response = $Client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        } catch { throw "Cannot reach OK.ru (network/timeout)." }
    } finally { $request.Dispose() }
    try {
        if (-not $response.IsSuccessStatusCode) {
            throw "OK.ru $Route returned HTTP $([int]$response.StatusCode)."
        }
        try {
            $json = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
        } catch { throw "OK.ru $Route returned unreadable JSON." }
        if ($json.error) {
            $reason = switch ([string]$json.error) {
                "error.notloggedin" { "Session invalid or expired" }
                "error.copyright.restriction" { "Access restricted" }
                default { "Service rejected request" }
            }
            throw "OK.ru $Route error: $reason."
        }
        return $json
    } finally { $response.Dispose() }
}

$client = $null
$session = $null
try {
    if ([string]::IsNullOrWhiteSpace($Query) -or $Query.Length -gt 200) { throw "Invalid search query." }
    Write-Host "Harbor OK.ru experimental API test. Use only your own account."
    Write-Host "Session and stream URLs will not be displayed or saved."
    $secret = Read-Host "Enter your own OK.ru JSESSIONID (hidden)" -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { $session = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($session -notmatch '^[A-Za-z0-9_.!-]{8,256}$') { throw "Unsupported session format." }
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.UseCookies = $false
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(12)

    Write-Host "[1/3] Authenticated music search..."
    $searchParams = @{ q = $Query; start = "0"; count = "5"; imgfmt = "base" }
    $cookieAuth = $false
    try {
        $found = Get-OkResponse -Client $client -Session $session -Route "tracks" -Parameters $searchParams
    } catch {
        if ($_.Exception.Message -notlike "*Session invalid or expired*") { throw }
        Write-Host "Legacy URL-session rejected. Trying a standard browser cookie header..."
        try {
            $found = Get-OkResponse -Client $client -Session $session -Route "tracks" -Parameters $searchParams -CookieAuth
            $cookieAuth = $true
            Write-Host "Cookie-based session accepted by search."
        } catch {
            if ($_.Exception.Message -like "*Session invalid or expired*") {
                throw "WMF rejected this session in both URL and Cookie modes. Do not keep copying the same website cookie. The music API may require separate authentication or a newer client."
            }
            throw
        }
    }
    if ($null -eq $found.tracks) { throw "Search response schema changed (no tracks array)." }
    $tracks = @($found.tracks)
    Write-Host "Search accepted. Found $($tracks.Count) tracks."
    if ($tracks.Count -eq 0) {
        Write-Host "PARTIAL: Search works but no tracks found; try a different query."
    } else {
        $id = [string]$tracks[0].id
        if ($id -notmatch '^[0-9]{1,20}$') { throw "Track ID format changed." }
        Write-Host "[2/3] Playback metadata..."
        $playback = Get-OkResponse -Client $client -Session $session -Route "play" -Parameters @{
            tid = $id; imgfmt = "base"
        } -CookieAuth:$cookieAuth
        $media = $null
        if (-not [Uri]::TryCreate([string]$playback.play, [UriKind]::Absolute, [ref]$media)) {
            throw "No usable media link was provided."
        }
        if ($media.Scheme -ne "https" -or
            -not $media.DnsSafeHost.ToLowerInvariant().EndsWith(".mycdn.me") -or
            $media.UserInfo.Length -gt 0) {
            throw "Unexpected media host. Probe stopped."
        }
        Write-Host "HTTPS media link returned (redacted)."
        Write-Host "[3/3] Checking audio response headers..."
        $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $media)
        $null = $request.Headers.TryAddWithoutValidation("Range", "bytes=0-")
        try {
            try {
                $audio = $client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
            } catch { throw "Media host unreachable or timed out." }
            try {
                $status = [int]$audio.StatusCode
                Write-Host "Audio HTTP status: $status."
                if ($status -ne 200 -and $status -ne 206) {
                    throw "Audio response unavailable or redirected (no download attempted)."
                }
                Write-Host "PASS: Search, playback metadata, and audio response headers succeeded."
            } finally { $audio.Dispose() }
        } finally { $request.Dispose() }
    }
} catch {
    Write-Host "FAIL: $($_.Exception.Message)"
    exit 1
} finally {
    $session = $null
    if ($null -ne $client) { $client.Dispose() }
}
