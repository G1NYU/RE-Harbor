; Harbor VOID + Refract: isolated, per-user installer of the verified portable binary.
; The application binary is taken unchanged from the successful preview artifact.
; No official Harbor files, file associations or updater registrations are touched.
!ifndef PAYLOAD_DIR
  !error "Provide /DPAYLOAD_DIR=payload when invoking makensis"
!endif

!include "MUI2.nsh"

Unicode true
Name "Harbor VOID"
OutFile "harbor-void-refract-setup-x64.exe"
InstallDir "$LOCALAPPDATA\Programs\Harbor VOID"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show
SetCompressor zlib
BrandingText "Harbor VOID — personal preview edition"

!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Harbor VOID" Install
  SetShellVarContext current
  ; The destination is fixed and distinct from official Harbor.
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Harbor VOID"
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD_DIR}\*.*"

  WriteUninstaller "$INSTDIR\Uninstall Harbor VOID.exe"

  CreateDirectory "$SMPROGRAMS"
  CreateShortCut "$SMPROGRAMS\Harbor VOID.lnk" "$INSTDIR\harbor.exe"
  CreateShortCut "$DESKTOP\Harbor VOID.lnk" "$INSTDIR\harbor.exe"

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HarborVOID" "DisplayName" "Harbor VOID"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HarborVOID" "DisplayVersion" "1.0.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HarborVOID" "Publisher" "G1NYU (independent Harbor fork)"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HarborVOID" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HarborVOID" "DisplayIcon" "$INSTDIR\harbor.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HarborVOID" "UninstallString" '"$INSTDIR\Uninstall Harbor VOID.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HarborVOID" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HarborVOID" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  ; Never delete a location chosen from user input or the registry.
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Harbor VOID"
  Delete "$SMPROGRAMS\Harbor VOID.lnk"
  Delete "$DESKTOP\Harbor VOID.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HarborVOID"
  RMDir /r "$INSTDIR"
  ; Application profile data under app.harbor.voidnativepreview is intentionally retained.
SectionEnd
