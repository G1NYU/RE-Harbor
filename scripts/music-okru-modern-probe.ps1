# Harbor OK.ru experimental modern WMF endpoint probe.
# Based on public okmusic-api 0.2 request shape (November 2026).
# Uses your own session. Never prints, stores, or uploads it.
param(
    [string]$Query = "Kate Bush",
    [string]$TrackId = "",
    [switch]$PlaybackOnly
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

function Invoke-OkModern {
    param(
        [System.Net.Http.HttpClient]$Client,
        [string]$Session,
        [string]$Route,
        [hashtable]$Params,
        [bool]$Post = $false
    )
    if ($Route -notin @("queryMixedSuggestions", "play")) {
        throw "Unsupported diagnostic route"
    }
    $parts = @()
    foreach ($key in @($Params.Keys | Sort-Object)) {
        $parts += [Uri]::EscapeDataString([string]$key) + "=" +
            [Uri]::EscapeDataString([string]$Params[$key])
    }
    $url = "https://wmf.ok.ru/$Route;jsessionid=$Session?" + [string]::Join("&", $parts)
    $method = if ($Post) { [System.Net.Http.HttpMethod]::Post } else { [System.Net.Http.HttpMethod]::Get }
    $request = [System.Net.Http.HttpRequestMessage]::new($method, $url)
    $response = $null
    try {
        # Match the documented browser-mode API shape, not the old /tracks endpoint.
        $null = $request.Headers.TryAddWithoutValidation("Cookie", "jsessionid=$Session")
        $null = $request.Headers.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36")
        $null = $request.Headers.TryAddWithoutValidation("Accept", "application/json, text/javascript, */*; q=0.01")
        $null = $request.Headers.TryAddWithoutValidation("Accept-Language", "ru-RU,ru;q=0.9,en;q=0.8")
        $null = $request.Headers.TryAddWithoutValidation("Referer", "https://ok.ru/")
        $null = $request.Headers.TryAddWithoutValidation("Origin", "https://ok.ru")
        $null = $request.Headers.TryAddWithoutValidation("X-Requested-With", "XMLHttpRequest")
        if ($Post) {
            $request.Content = [System.Net.Http.StringContent]::new("", [Text.Encoding]::UTF8, "application/x-www-form-urlencoded")
        }
        try {
            $response = $Client.SendAsync(
                $request,
                [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead
            ).GetAwaiter().GetResult()
        } catch {
            throw "WMF request could not complete (network, TLS, or timeout)."
        }
        $code = [int]$response.StatusCode
        Write-Host ("{0} HTTP status: {1}" -f $Route, $code)
        if (-not $response.IsSuccessStatusCode) {
            throw "WMF returned HTTP $code; endpoint or browser transport may be incompatible."
        }
        try {
            $json = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
        } catch {
            throw "WMF replied with non-JSON or unsupported JSON."
        }
        if ($null -eq $json) { throw "WMF returned empty JSON." }
        $errorValue = [string]$json.error
        if (-not [string]::IsNullOrEmpty($errorValue)) {
            switch ($errorValue) {
                "error.notloggedin" { throw "WMF rejected the session for this endpoint." }
                "error.copyright.restriction" { throw "WMF restricted playback for this recording." }
                default { throw "WMF returned a service error (details hidden)." }
            }
        }
        return $json
    } finally {
        if ($null -ne $response) { $response.Dispose() }
        $request.Dispose()
    }
}

$session = $null
$client = $null
try {
    if (-not $PlaybackOnly -and ([string]::IsNullOrWhiteSpace($Query) -or $Query.Length -gt 200)) {
        throw "Use a query between 1 and 200 characters."
    }
    if ($PlaybackOnly -and -not $TrackId) {
        throw "PlaybackOnly requires a numeric TrackId."
    }
    if ($TrackId -and $TrackId -notmatch '^[0-9]{1,20}$') {
        throw "TrackId must be a numeric OK.ru music track ID."
    }
    Write-Host "Harbor OK.ru 2026 API diagnostic (metadata only; no audio download)."
    Write-Host "Use the jsessionid shown in YOUR successful wmf.ok.ru/play browser request,"
    Write-Host "which may differ from the JSESSIONID cookie listed under ok.ru."
    Write-Host "Credentials, audio URLs, and song data are NOT printed or saved."
    $secret = Read-Host "Music-service jsessionid (hidden)" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { $session = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    if ($session -notmatch '^[A-Za-z0-9_.!-]{8,256}$') {
        throw "Unsupported session format."
    }
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.UseCookies = $false
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(18)

    if (-not $PlaybackOnly) {
        Write-Host "[1/2] Testing current WMF mixed-suggestions search..."
        $result = Invoke-OkModern -Client $client -Session $session -Route "queryMixedSuggestions" -Params @{
            q = $Query
            client = "web"
            locale = "ru"
        }
        $known = @($result.PSObject.Properties.Name |
            Where-Object { $_ -match '^[a-zA-Z][a-zA-Z0-9_]{0,50}
    Write-Host "[2/2] Testing own playable track metadata via POST /play..."
    $play = Invoke-OkModern -Client $client -Session $session -Route "play" -Post $true -Params @{
        tid = $TrackId
        ctx = "my|1"
        client = "web"
        locale = "ru"
        imgfmt = "base"
    }
    if (-not $play.play) {
        throw "Playback JSON has no direct play field (not currently resolved)."
    }
    Write-Host "PASS: WMF returned playback metadata. Signed media URL intentionally redacted."
    Write-Host "Native audio delivery still needs separate testing."
} catch {
    Write-Host ("FAIL: " + $_.Exception.Message)
    exit 1
} finally {
    $session = $null
    if ($null -ne $client) { $client.Dispose() }
}
 } |
            Select-Object -First 12)
        Write-Host ("Search JSON accepted. Top-level field names: {0}" -f ([string]::Join(", ", $known)))
        Write-Host "Search endpoint responded. This does not yet prove playable audio."
    }

    if (-not $TrackId) {
        Write-Host "PARTIAL PASS: Search probe completed. Playback not requested (no TrackId supplied)."
        Write-Host "Report HTTP statuses and field names only, never URLs or cookies."
        exit 0
    }
    Write-Host "[2/2] Testing own playable track metadata via POST /play..."
    $play = Invoke-OkModern -Client $client -Session $session -Route "play" -Post $true -Params @{
        tid = $TrackId
        ctx = "my|1"
        client = "web"
        locale = "ru"
        imgfmt = "base"
    }
    if (-not $play.play) {
        throw "Playback JSON has no direct play field (not currently resolved)."
    }
    Write-Host "PASS: WMF returned playback metadata. Signed media URL intentionally redacted."
    Write-Host "Native audio delivery still needs separate testing."
} catch {
    Write-Host ("FAIL: " + $_.Exception.Message)
    exit 1
} finally {
    $session = $null
    if ($null -ne $client) { $client.Dispose() }
}
