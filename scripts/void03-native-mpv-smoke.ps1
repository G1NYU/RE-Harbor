param(
  [Parameter(Mandatory = $true)]
  [string]$VideoPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dll = Join-Path $root 'src-tauri/libmpv/libmpv-2.dll'
if (-not (Test-Path -LiteralPath $dll -PathType Leaf)) {
  throw "Pinned libmpv DLL is missing: $dll. Run pnpm run setup:libmpv."
}
if (-not (Test-Path -LiteralPath $VideoPath -PathType Leaf)) {
  throw "Offline video fixture is missing: $VideoPath"
}
$video = (Resolve-Path -LiteralPath $VideoPath).Path.Replace('\', '/')
if ((Get-Item -LiteralPath $VideoPath).Length -lt 100) {
  throw 'Offline video fixture is unexpectedly empty'
}

# Exercise the exact libmpv-2.dll packaged by Harbor, not an independent mpv.exe.
# Only this smoke process changes the DLL search directory; no application
# settings, profile data or playback-provider configuration are modified.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class Void03NativeMpv {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetDllDirectory(string directory);

    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr mpv_create();

    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int mpv_initialize(IntPtr context);

    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void mpv_terminate_destroy(IntPtr context);

    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int mpv_set_option_string(
        IntPtr context,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string name,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string value);

    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int mpv_command_string(
        IntPtr context,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string command);

    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl, EntryPoint = "mpv_get_property")]
    public static extern int ReadInt64(
        IntPtr context,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string name,
        int format,
        out long data);

    [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl, EntryPoint = "mpv_get_property")]
    public static extern int ReadDouble(
        IntPtr context,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string name,
        int format,
        out double data);
}
'@

if (-not [Void03NativeMpv]::SetDllDirectory((Split-Path -Parent $dll))) {
  throw 'Windows could not configure the pinned DLL directory'
}

$context = [IntPtr]::Zero
try {
  $context = [Void03NativeMpv]::mpv_create()
  if ($context -eq [IntPtr]::Zero) { throw 'mpv_create returned a null context' }

  foreach ($item in @(
    @('config', 'no'),
    @('script', 'no'),
    @('ytdl', 'no'),
    @('vo', 'null'),
    @('ao', 'null'),
    @('hwdec', 'no'),
    @('keep-open', 'yes'),
    @('idle', 'yes')
  )) {
    $rc = [Void03NativeMpv]::mpv_set_option_string($context, $item[0], $item[1])
    if ($rc -lt 0) { throw "libmpv rejected option $($item[0]): $rc" }
  }

  $rc = [Void03NativeMpv]::mpv_initialize($context)
  if ($rc -lt 0) { throw "mpv_initialize failed: $rc" }

  $rc = [Void03NativeMpv]::mpv_command_string($context, ('loadfile "' + $video + '" replace'))
  if ($rc -lt 0) { throw "libmpv could not load the fixture: $rc" }

  $width = [long]0
  $height = [long]0
  $position = [double]0
  $decoded = $false
  $deadline = (Get-Date).AddSeconds(25)
  while ((Get-Date) -lt $deadline) {
    $wResult = [Void03NativeMpv]::ReadInt64($context, 'video-params/w', 4, [ref]$width)
    $hResult = [Void03NativeMpv]::ReadInt64($context, 'video-params/h', 4, [ref]$height)
    $tResult = [Void03NativeMpv]::ReadDouble($context, 'time-pos', 5, [ref]$position)
    if ($wResult -ge 0 -and $hResult -ge 0 -and $tResult -ge 0 -and
        $width -eq 96 -and $height -eq 54 -and $position -gt 0.1) {
      $decoded = $true
      break
    }
    Start-Sleep -Milliseconds 100
  }
  if (-not $decoded) {
    throw "libmpv did not decode/advance the VP8 fixture (width=$width height=$height position=$position)"
  }
  Write-Host "Native libmpv decoded 96x54 VP8 video; playback position: $position seconds"

  $rc = [Void03NativeMpv]::mpv_command_string($context, 'seek 3 absolute+exact')
  if ($rc -lt 0) { throw "libmpv seek command failed: $rc" }
  $seeked = $false
  $deadline = (Get-Date).AddSeconds(8)
  while ((Get-Date) -lt $deadline) {
    $tResult = [Void03NativeMpv]::ReadDouble($context, 'time-pos', 5, [ref]$position)
    if ($tResult -ge 0 -and $position -ge 2.5) { $seeked = $true; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $seeked) { throw "Native libmpv did not seek to the 3-second marker (position=$position)" }
  Write-Host "Native libmpv seek passed (position: $position seconds)"
} finally {
  if ($context -ne [IntPtr]::Zero) {
    [Void03NativeMpv]::mpv_terminate_destroy($context)
  }
  [void][Void03NativeMpv]::SetDllDirectory('')
}
