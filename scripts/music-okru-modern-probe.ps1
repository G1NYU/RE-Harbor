# Experimental OK.ru music API probe (Windows PowerShell 5.1).
# Uses the user's own music-service session. No credentials, URLs or audio are saved.
param(
    [string]$Query = "Kate Bush",
    [string]$TrackId = "",
    [switch]$PlaybackOnly
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

function Invoke-OkMusic {
    param(
        [System.Net.Http.HttpClient]$Client,
        [string]$Session,
        [string]$Route,
        [hashtable]$Parameters,
        [bool]$Post = $false
    )

    if ($Route -notin @("queryMixedSuggestions", "play")) {
        throw "Unsupported diagnostic route."
    }
    $pairs = @()
    foreach ($key in @($Parameters.Keys | Sort-Object)) {
        $pairs += [Uri]::EscapeDataString([string]$key) + "=" +
            [Uri]::EscapeDataString([string]$Parameters[$key])
    }
    $url = "https://wmf.ok.ru/$Route;jsessionid=$Session?" + [string]::Join("&", $pairs)
    $method = if ($Post) { [System.Net.Http.HttpMethod]::Post } else { [System.Net.Http.HttpMethod]::Get }
    $request = [System.Net.Http.HttpRequestMessage]::new($method, $url)
    $response = $null
    try {
        $null = $request.Headers.TryAddWithoutValidation("Cookie", "jsessionid=$Session")
        $null = $request.Headers.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        $null = $request.Headers.TryAddWithoutValidation("Accept", "application/json, text/javascript, */*; q=0.01")
        $null = $request.Headers.TryAddWithoutValidation("Accept-Language", "ru-RU,ru;q=0.9,en;q=0.8")
        $null = $request.Headers.TryAddWithoutValidation("Origin", "https://ok.ru")
        $referer = if ($Post -and $Parameters.ContainsKey("tid")) {
            "https://ok.ru/music/profile/" + [string]$Parameters["tid"]
        } else { "https://ok.ru/" }
        $null = $request.Headers.TryAddWithoutValidation("Referer", $referer)
        $null = $request.Headers.TryAddWithoutValidation("X-Requested-With", "XMLHttpRequest")
        if ($Post) {
            $request.Content = [System.Net.Http.ByteArrayContent]::new([byte[]]@())
            $null = $request.Content.Headers.TryAddWithoutValidation("Content-Type", "application/x-www-form-urlencoded")
        }

        try {
            $response = $Client.SendAsync(
                $request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead
            ).GetAwaiter().GetResult()
        } catch {
            throw "OK.ru request failed (network, TLS, or timeout)."
        }
        $status = [int]$response.StatusCode
        Write-Host ("{0} HTTP status: {1}" -f $Route, $status)
        if (-not $response.IsSuccessStatusCode) {
            # Only print known-safe service error codes, never raw response content.
            $safeCode = ""
            try {
                $failure = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
                $code = [string]$failure.error
                if ($code -match '^error[.][a-zA-Z0-9_.-]{1,72}$') {
                    $safeCode = " (service code: " + $code + ")"
                }
            } catch { }
            throw "OK.ru returned HTTP $status$safeCode."
        }
        try {
            $json = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
        } catch {
            throw "OK.ru returned unreadable JSON."
        }
        if ($null -eq $json) { throw "OK.ru returned empty JSON." }
        if ($null -ne $json.error -and [string]$json.error -ne "") {
            if ($json.error -eq "error.notloggedin") {
                throw "OK.ru music service rejected this session."
            }
            if ($json.error -eq "error.copyright.restriction") {
                throw "OK.ru restricts this recording."
            }
            throw "OK.ru rejected the request."
        }
        return $json
    } finally {
        if ($null -ne $response) { $response.Dispose() }
        $request.Dispose()
    }
}

$client = $null
$session = $null
try {
    if (-not $PlaybackOnly -and (
        [string]::IsNullOrWhiteSpace($Query) -or $Query.Length -gt 200
    )) {
        throw "Search query must be between 1 and 200 characters."
    }
    if ($TrackId -and $TrackId -notmatch '^[0-9]{1,20}$') {
        throw "TrackId must be numeric."
    }
    if ($PlaybackOnly -and -not $TrackId) {
        throw "PlaybackOnly requires -TrackId."
    }

    Write-Host "Harbor OK.ru browser-music API test (no audio download)."
    Write-Host "Use the jsessionid from YOUR successful wmf.ok.ru/play request."
    Write-Host "Session identifiers and signed media URLs are never printed."
    $secure = Read-Host "Music-service jsessionid (hidden)" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $session = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
    if ($session -notmatch '^[A-Za-z0-9_.!-]{8,256}$') {
        throw "Session format is not supported."
    }

    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $handler.UseCookies = $false
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(18)

    if (-not $PlaybackOnly) {
        Write-Host "[1/2] Testing music search..."
        $search = Invoke-OkMusic -Client $client -Session $session -Route "queryMixedSuggestions" -Parameters @{
            q = $Query
            client = "web"
            locale = "ru"
        }
        $fields = @($search.PSObject.Properties.Name | Where-Object {
            $_ -match '^[a-zA-Z][a-zA-Z0-9_]{0,50}$'
        } | Select-Object -First 12)
        Write-Host ("Search succeeded. Top-level JSON field names: " + [string]::Join(", ", $fields))
    }

    if (-not $TrackId) {
        Write-Host "PARTIAL PASS: Search checked; no track ID provided for playback."
    } else {
        Write-Host "[2/2] Testing authorized POST /play metadata..."
        $playback = Invoke-OkMusic -Client $client -Session $session -Route "play" -Post $true -Parameters @{
            tid = $TrackId
            ctx = "my|1"
            client = "web"
            locale = "ru"
            imgfmt = "base"
        }
        if ([string]::IsNullOrWhiteSpace([string]$playback.play)) {
            throw "POST /play did not return a playable media field."
        }
        Write-Host "PASS: Playback metadata returned; signed URL redacted."
        Write-Host "Native audio streaming remains unverified."
    }
} catch {
    Write-Host ("FAIL: " + $_.Exception.Message)
    exit 1
} finally {
    $session = $null
    if ($null -ne $client) { $client.Dispose() }
}
