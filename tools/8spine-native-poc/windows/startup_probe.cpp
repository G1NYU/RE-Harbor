// Loader diagnostic only: no C/C++ runtime, no network, no host file access.
// Build with /GS- /Zl and link only kernel32.lib using the explicit entrypoint.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

extern "C" void WINAPI fixture_entry() {
    const char marker[] = "startup-ok\n";
    DWORD written = 0;
    const HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
    const BOOL ok = output && output != INVALID_HANDLE_VALUE &&
        WriteFile(output, marker, sizeof(marker) - 1, &written, nullptr);
    ExitProcess(ok && written == sizeof(marker) - 1 ? 0 : 1);
}
