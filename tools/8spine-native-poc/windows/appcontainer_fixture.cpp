// Windows fixture-only sandbox experiment. Never launch downloaded code here.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <userenv.h>
#include <aclapi.h>
#include <sddl.h>
#include <objbase.h>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include <algorithm>
#include <cwctype>

namespace fs = std::filesystem;
constexpr DWORD MAX_REPLY = 257 * 1024;
constexpr ULONGLONG WALL_MS = 5000;

[[noreturn]] void fail(const char* stage, DWORD code = GetLastError()) {
    throw std::runtime_error(std::string(stage) + ": " + std::to_string(code));
}
void require(BOOL ok, const char* stage) { if (!ok) fail(stage); }

struct Handle {
    HANDLE h = nullptr;
    Handle() = default;
    explicit Handle(HANDLE value) : h(value) {}
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
    ~Handle() { close(); }
    void close() {
        if (h && h != INVALID_HANDLE_VALUE) CloseHandle(h);
        h = nullptr;
    }
};

struct Profile {
    std::wstring name;
    PSID sid = nullptr;
    Profile() {
        GUID id{};
        if (FAILED(CoCreateGuid(&id))) fail("profile GUID");
        wchar_t guid[40]{};
        if (!StringFromGUID2(id, guid, 40)) fail("profile name");
        name = L"Harbor8SpineFixture.";
        for (auto ch : std::wstring(guid)) if (iswalnum(ch)) name += ch;
        const HRESULT result = CreateAppContainerProfile(name.c_str(), L"Harbor 8SPINE fixture",
            L"Temporary music isolation CI test", nullptr, 0, &sid);
        if (FAILED(result)) fail("CreateAppContainerProfile", static_cast<DWORD>(result));
    }
    ~Profile() {
        if (sid) FreeSid(sid);
        if (!name.empty()) {
            const HRESULT result = DeleteAppContainerProfile(name.c_str());
            if (FAILED(result)) std::cerr << "profile cleanup failed: " << static_cast<DWORD>(result) << "\n";
        }
    }
    Profile(const Profile&) = delete;
};

void grant_read_execute(const fs::path& file, PSID sid) {
    PACL old_acl = nullptr, next_acl = nullptr;
    PSECURITY_DESCRIPTOR sd = nullptr;
    auto path = file.wstring();
    DWORD error = GetNamedSecurityInfoW(path.data(), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
        nullptr, nullptr, &old_acl, nullptr, &sd);
    if (error != ERROR_SUCCESS) fail("read fixture ACL", error);
    if (!old_acl) { LocalFree(sd); fail("unexpected null fixture DACL", ERROR_INVALID_SECURITY_DESCR); }
    EXPLICIT_ACCESSW access{};
    access.grfAccessPermissions = FILE_GENERIC_READ | FILE_GENERIC_EXECUTE;
    access.grfAccessMode = GRANT_ACCESS;
    access.grfInheritance = NO_INHERITANCE;
    access.Trustee.TrusteeForm = TRUSTEE_IS_SID;
    access.Trustee.TrusteeType = TRUSTEE_IS_UNKNOWN;
    access.Trustee.ptstrName = reinterpret_cast<LPWSTR>(sid);
    error = SetEntriesInAclW(1, &access, old_acl, &next_acl);
    if (error == ERROR_SUCCESS) {
        error = SetNamedSecurityInfoW(path.data(), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
            nullptr, nullptr, next_acl, nullptr);
    }
    if (next_acl) LocalFree(next_acl);
    if (sd) LocalFree(sd);
    if (error != ERROR_SUCCESS) fail("grant fixture read execute", error);
}

// A non-interactive CI/service window station may deny USER32 initialization
// for a Low-IL AppContainer. Use a brand-new, noninteractive station and
// desktop with an explicit Low label and only test-specific principals.
// Never edit the DACL or integrity label of the caller's station or desktop.
std::wstring sid_string(PSID sid) {
    LPWSTR raw = nullptr;
    require(ConvertSidToStringSidW(sid, &raw), "ConvertSidToStringSidW");
    std::wstring value(raw);
    LocalFree(raw);
    return value;
}

std::wstring current_user_sid() {
    Handle token;
    require(OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token.h), "parent token");
    DWORD size = 0, used = 0;
    GetTokenInformation(token.h, TokenUser, nullptr, 0, &size);
    if (!size || GetLastError() != ERROR_INSUFFICIENT_BUFFER) fail("parent SID size");
    std::vector<unsigned char> raw(size);
    require(GetTokenInformation(token.h, TokenUser, raw.data(), size, &used), "parent SID");
    return sid_string(reinterpret_cast<TOKEN_USER*>(raw.data())->User.Sid);
}

struct Descriptor {
    PSECURITY_DESCRIPTOR value = nullptr;
    SECURITY_ATTRIBUTES attrs{};
    explicit Descriptor(const std::wstring& sddl) {
        require(ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.c_str(), SDDL_REVISION_1, &value, nullptr), "private desktop SDDL");
        attrs = {sizeof(attrs), value, FALSE};
    }
    ~Descriptor() { if (value) LocalFree(value); }
    Descriptor(const Descriptor&) = delete;
};

struct PrivateDesktop {
    HWINSTA station = nullptr;
    HDESK desktop = nullptr;
    std::wstring name;

    explicit PrivateDesktop(const Profile& profile) {
        DWORD session = 0;
        require(ProcessIdToSessionId(GetCurrentProcessId(), &session), "parent session");
        std::cerr << "AppContainer parent session: " << session << "\n";
        // The profile name includes a random GUID. All permissions below
        // apply exclusively to these new, disposable desktop objects.
        const std::wstring station_name = profile.name + L".Station";
        const std::wstring user = current_user_sid();
        const std::wstring app = sid_string(profile.sid);
        const std::wstring common = L"D:P(A;;GA;;;SY)(A;;GA;;;" + user + L")";
        Descriptor station_sd(common + L"(A;;0x000f037f;;;RC)(A;;0x00020327;;;" +
            app + L")S:(ML;;NW;;;LW)");
        Descriptor desktop_sd(common + L"(A;;0x000f01ff;;;RC)(A;;0x000f01ff;;;" +
            app + L")S:(ML;;NW;;;LW)");
        const HWINSTA original = GetProcessWindowStation();
        if (!original) fail("GetProcessWindowStation");
        station = CreateWindowStationW(station_name.c_str(), 0, WINSTA_ALL_ACCESS, &station_sd.attrs);
        if (!station) fail("CreateWindowStationW");
        if (!SetProcessWindowStation(station)) {
            DWORD error = GetLastError();
            CloseWindowStation(station); station = nullptr;
            fail("select private station", error);
        }
        // This single-threaded harness creates no UI windows. Always restore
        // the original station before launching any child.
        desktop = CreateDesktopW(L"Worker", nullptr, nullptr, 0,
            DESKTOP_READOBJECTS | DESKTOP_CREATEWINDOW | DESKTOP_WRITEOBJECTS |
            READ_CONTROL, &desktop_sd.attrs);
        const DWORD create_error = desktop ? ERROR_SUCCESS : GetLastError();
        if (!SetProcessWindowStation(original)) {
            // The harness cannot safely continue after restoration failure.
            fail("restore parent station");
        }
        if (!desktop) {
            CloseWindowStation(station); station = nullptr;
            fail("CreateDesktopW", create_error);
        }
        name = station_name + L"\\Worker";
        std::cerr << "Private low-integrity window station and desktop created\n";
    }
    ~PrivateDesktop() {
        if (desktop) CloseDesktop(desktop);
        if (station) CloseWindowStation(station);
    }
    PrivateDesktop(const PrivateDesktop&) = delete;
};

struct Attributes {
    std::vector<unsigned char> storage;
    LPPROC_THREAD_ATTRIBUTE_LIST list = nullptr;
    Attributes() {
        SIZE_T size = 0;
        InitializeProcThreadAttributeList(nullptr, 3, 0, &size);
        if (!size || GetLastError() != ERROR_INSUFFICIENT_BUFFER) fail("attribute size");
        storage.resize(size);
        auto ptr = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
        require(InitializeProcThreadAttributeList(ptr, 3, 0, &size), "attribute init");
        list = ptr;
    }
    ~Attributes() { if (list) DeleteProcThreadAttributeList(list); }
    void add(DWORD_PTR key, void* data, SIZE_T size) {
        require(UpdateProcThreadAttribute(list, 0, key, data, size, nullptr, nullptr), "attribute update");
    }
};

void pipe_pair(Handle& read, Handle& write) {
    SECURITY_ATTRIBUTES sa{sizeof(sa), nullptr, TRUE};
    require(CreatePipe(&read.h, &write.h, &sa, 4096), "CreatePipe");
}

std::wstring quoted(const std::wstring& value) {
    if (value.find(L'"') != std::wstring::npos || (!value.empty() && value.back() == L'\\'))
        fail("invalid fixture argument", ERROR_INVALID_PARAMETER);
    return L"\"" + value + L"\"";
}

void verify_token(HANDLE process, PSID expected) {
    Handle token;
    require(OpenProcessToken(process, TOKEN_QUERY, &token.h), "OpenProcessToken");
    DWORD yes = 0, used = 0;
    require(GetTokenInformation(token.h, TokenIsAppContainer, &yes, sizeof(yes), &used), "TokenIsAppContainer");
    if (!yes) fail("worker token is not AppContainer", ERROR_ACCESS_DENIED);
    DWORD size = 0;
    GetTokenInformation(token.h, TokenAppContainerSid, nullptr, 0, &size);
    if (!size || GetLastError() != ERROR_INSUFFICIENT_BUFFER) fail("token SID size");
    std::vector<unsigned char> raw(size);
    require(GetTokenInformation(token.h, TokenAppContainerSid, raw.data(), size, &used), "TokenAppContainerSid");
    auto info = reinterpret_cast<TOKEN_APPCONTAINER_INFORMATION*>(raw.data());
    if (!info->TokenAppContainer || !EqualSid(info->TokenAppContainer, expected))
        fail("unexpected worker AppContainer SID", ERROR_ACCESS_DENIED);
}

struct Child {
    Handle process, thread;
    ~Child() {
        if (process.h) {
            // Job close covers the assigned child; explicitly terminate even if
            // failure occurred before assignment or resume.
            DWORD code = 0;
            if (GetExitCodeProcess(process.h, &code) && code == STILL_ACTIVE) {
                TerminateProcess(process.h, 1);
                WaitForSingleObject(process.h, 1000);
            }
        }
    }
};

std::string run_fixture(const fs::path& worker, const Profile& profile,
                        const PrivateDesktop& private_desktop, const std::wstring& args, const std::string& input) {
    if (input.size() > 1024) fail("fixture input limit", ERROR_INVALID_PARAMETER);
    Handle child_in, parent_in, parent_out, child_out;
    pipe_pair(child_in, parent_in);
    pipe_pair(parent_out, child_out);
    require(SetHandleInformation(parent_in.h, HANDLE_FLAG_INHERIT, 0), "parent stdin inheritance");
    require(SetHandleInformation(parent_out.h, HANDLE_FLAG_INHERIT, 0), "parent stdout inheritance");
    // The fixture input is much smaller than the anonymous pipe capacity.
    if (!input.empty()) {
        DWORD sent = 0;
        require(WriteFile(parent_in.h, input.data(), static_cast<DWORD>(input.size()), &sent, nullptr), "write fixture");
        if (sent != input.size()) fail("short fixture input", ERROR_WRITE_FAULT);
    }
    parent_in.close();

    SECURITY_CAPABILITIES security{};
    security.AppContainerSid = profile.sid;
    HANDLE inherited[] = {child_in.h, child_out.h};
    DWORD child_policy = PROCESS_CREATION_CHILD_PROCESS_RESTRICTED;
    Attributes attrs;
    attrs.add(PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, &security, sizeof(security));
    attrs.add(PROC_THREAD_ATTRIBUTE_HANDLE_LIST, inherited, sizeof(inherited));
    attrs.add(PROC_THREAD_ATTRIBUTE_CHILD_PROCESS_POLICY, &child_policy, sizeof(child_policy));

    STARTUPINFOEXW si{};
    si.StartupInfo.cb = sizeof(si);
    si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    std::wstring desktop_name = private_desktop.name;
    si.StartupInfo.lpDesktop = desktop_name.data();
    si.StartupInfo.hStdInput = child_in.h;
    si.StartupInfo.hStdOutput = child_out.h;
    si.StartupInfo.hStdError = child_out.h;
    si.lpAttributeList = attrs.list;

    Handle job(CreateJobObjectW(nullptr, nullptr));
    if (!job.h) fail("CreateJobObject");
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_ACTIVE_PROCESS |
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_PROCESS_MEMORY;
    limits.BasicLimitInformation.ActiveProcessLimit = 1;
    limits.ProcessMemoryLimit = 128ULL * 1024 * 1024;
    require(SetInformationJobObject(job.h, JobObjectExtendedLimitInformation,
        &limits, sizeof(limits)), "SetInformationJobObject");

    wchar_t root[MAX_PATH + 1]{};
    UINT root_len = GetWindowsDirectoryW(root, MAX_PATH + 1);
    if (!root_len || root_len > MAX_PATH) fail("GetWindowsDirectory");
    // Windows resolves the AppContainer profile using LOCALAPPDATA and
    // redirects that variable to the container's private profile at launch.
    // Retain only the required profile input and SystemRoot; never inherit
    // PATH, runner secrets, or the full parent environment.
    const DWORD size = GetEnvironmentVariableW(L"LOCALAPPDATA", nullptr, 0);
    if (size < 2 || size > 32767) fail("LOCALAPPDATA required for AppContainer profile", ERROR_ENVVAR_NOT_FOUND);
    std::vector<wchar_t> local(size);
    const DWORD count = GetEnvironmentVariableW(L"LOCALAPPDATA", local.data(), size);
    if (!count || count >= size || !fs::path(local.data()).is_absolute())
        fail("invalid LOCALAPPDATA for AppContainer profile", ERROR_INVALID_DATA);
    std::wstring environment = L"LOCALAPPDATA=" + std::wstring(local.data(), count);
    environment.push_back(L'\0');
    environment += L"SystemRoot=" + std::wstring(root);
    environment.push_back(L'\0');
    environment.push_back(L'\0');
    std::wstring line = quoted(worker.wstring()) + args;
    PROCESS_INFORMATION pi{};
    Child child;
    require(CreateProcessW(worker.c_str(), line.data(), nullptr, nullptr, TRUE,
        EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT,
        environment.data(), worker.parent_path().c_str(), &si.StartupInfo, &pi), "CreateProcess AppContainer");
    child.process.h = pi.hProcess;
    child.thread.h = pi.hThread;
    child_in.close();
    child_out.close();

    verify_token(child.process.h, profile.sid);
    std::cerr << "Verified actual child AppContainer token\n";
    require(AssignProcessToJobObject(job.h, child.process.h), "AssignProcessToJobObject");
    if (ResumeThread(child.thread.h) == static_cast<DWORD>(-1)) fail("ResumeThread");

    std::string output;
    const ULONGLONG start = GetTickCount64();
    while (true) {
        if (GetTickCount64() - start > WALL_MS) fail("fixture wall deadline", WAIT_TIMEOUT);
        DWORD available = 0;
        if (!PeekNamedPipe(parent_out.h, nullptr, 0, nullptr, &available, nullptr)) {
            if (GetLastError() == ERROR_BROKEN_PIPE) break;
            fail("PeekNamedPipe");
        }
        if (available) {
            char buf[4096];
            DWORD got = 0;
            require(ReadFile(parent_out.h, buf, std::min<DWORD>(available, sizeof(buf)), &got, nullptr), "ReadFile");
            if (!got) fail("zero-byte fixture read", ERROR_INVALID_DATA);
            if (output.size() + got > MAX_REPLY) fail("fixture output limit", ERROR_BUFFER_OVERFLOW);
            output.append(buf, got);
        } else {
            const DWORD state = WaitForSingleObject(child.process.h, 10);
            if (state == WAIT_FAILED) fail("wait fixture");
            // The process can finish between PeekNamedPipe and the wait.
            // A signaled process is not EOF: the final bytes may have arrived
            // after the peek. Drain until the last writer closes the pipe.
            // A leaked writer cannot hang the supervisor past WALL_MS.
            if (state == WAIT_OBJECT_0) Sleep(1);
        }
    }
    const auto elapsed = GetTickCount64() - start;
    const DWORD remaining = elapsed >= WALL_MS ? 0 : static_cast<DWORD>(WALL_MS - elapsed);
    if (WaitForSingleObject(child.process.h, remaining) != WAIT_OBJECT_0) fail("fixture exit deadline", WAIT_TIMEOUT);
    DWORD code = 0;
    require(GetExitCodeProcess(child.process.h, &code), "GetExitCodeProcess");
    if (code != 0) fail("worker exit", code);
    std::cerr << "Fixture exited successfully; drained bytes: " << output.size() << "\n";
    if (output.empty()) fail("empty fixture response", ERROR_INVALID_DATA);
    return output;
}

int wmain(int argc, wchar_t** argv) {
    try {
        if (argc != 4) fail("expected copied worker, test sentinel, loopback port", ERROR_INVALID_PARAMETER);
        const fs::path worker = fs::absolute(argv[1]);
        const fs::path sentinel = fs::absolute(argv[2]);
        const std::wstring port = argv[3];
        if (port.empty() || port.size() > 5 ||
            !std::all_of(port.begin(), port.end(), [](wchar_t c) { return c >= L'0' && c <= L'9'; }) ||
            std::stoul(port) == 0 || std::stoul(port) > 65535 ||
            worker.filename() != L"harbor-8spine-native-poc.exe" ||
            !fs::is_regular_file(worker) || !fs::is_regular_file(sentinel) ||
            worker.parent_path() == sentinel.parent_path())
            fail("invalid fixture paths", ERROR_INVALID_PARAMETER);
        Profile profile;
        grant_read_execute(worker.parent_path(), profile.sid);
        grant_read_execute(worker, profile.sid);
        const std::wstring args = L" --isolation-probe " + quoted(sentinel.wstring()) +
            L" " + quoted(L"127.0.0.1:" + port);
        PrivateDesktop private_desktop(profile);
        const fs::path startup = worker.parent_path() / L"8spine-startup-probe.exe";
        if (!fs::is_regular_file(startup)) fail("startup diagnostic missing", ERROR_FILE_NOT_FOUND);
        grant_read_execute(startup, profile.sid);
        bool startup_ok = false;
        try {
            const auto response = run_fixture(startup, profile, private_desktop, L"", "");
            startup_ok = response == "startup-ok\n" || response == "startup-ok\r\n";
            std::cerr << "Minimal kernel32 startup probe: " << (startup_ok ? "passed" : "invalid response") << "\n";
        } catch (const std::exception& error) {
            std::cerr << "Minimal kernel32 startup probe failed: " << error.what() << "\n";
        }
        // Still run the real fixture so one diagnostic failure cannot hide the
        // other. A passing job requires both, with identical confinement.
        std::cerr << "Starting Rust containment probe\n";
        const auto probe = run_fixture(worker, profile, private_desktop, args, "");
        std::cerr << "Starting Rust catalog fixture\n";
        const auto catalog = run_fixture(worker, profile, private_desktop, L"",
            R"({"fixture":"catalog","operation":"search","query":"test tone","limit":10})");
        if (!startup_ok) fail("minimal startup probe failed", ERROR_INVALID_DATA);
        std::cout << probe << catalog;
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "AppContainer fixture: " << error.what() << "\n";
        return 1;
    }
}
