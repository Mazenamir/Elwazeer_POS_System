!macro customInstall
  SetRegView 64
  DetailPrint "Checking Microsoft Visual C++ Redistributable (x64)..."
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  StrCmp $0 "1" vcredist_already_installed install_vcredist

install_vcredist:
  DetailPrint "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)..."
  SetOutPath "$TEMP"
  File "${BUILD_RESOURCES_DIR}\vc_redist.x64.exe"
  ExecWait '"$TEMP\vc_redist.x64.exe" /install /quiet /norestart' $0
  Delete "$TEMP\vc_redist.x64.exe"
  
  StrCmp $0 "0" vcredist_success
  StrCmp $0 "3010" vcredist_reboot
  StrCmp $0 "1638" vcredist_success
  
  DetailPrint "WARNING: Visual C++ Redistributable returned exit code: $0"
  MessageBox MB_ICONEXCLAMATION|MB_OK "Microsoft Visual C++ Redistributable returned code $0. Installation will proceed, but if database startup fails, please install Visual C++ Redistributable x64 manually."
  Goto init_app_dirs

vcredist_reboot:
  DetailPrint "Visual C++ Redistributable installed (system reboot may be required)."
  Goto init_app_dirs

vcredist_already_installed:
  DetailPrint "Microsoft Visual C++ Redistributable (x64) is already installed."
  Goto init_app_dirs

vcredist_success:
  DetailPrint "Microsoft Visual C++ Redistributable (x64) installed successfully."
  Goto init_app_dirs

init_app_dirs:
  DetailPrint "Configuring persistent application data directory..."
  SetShellVarContext all
  ReadEnvStr $R0 "ProgramData"
  StrCmp $R0 "" 0 +2
  StrCpy $R0 "$APPDATA"
  StrCmp $R0 "" 0 +2
  StrCpy $R0 "C:\ProgramData"
  CreateDirectory "$R0\Bebyoon System"
  CreateDirectory "$R0\Bebyoon System\data"
  CreateDirectory "$R0\Bebyoon System\data\uploads"
  CreateDirectory "$R0\Bebyoon System\data\uploads\products"
  CreateDirectory "$R0\Bebyoon System\postgres_data"
  ExecWait '"$SYSDIR\icacls.exe" "$R0\Bebyoon System" /grant *S-1-1-0:(OI)(CI)F /T /Q' $0
!macroend

!macro customUnInstall
  ; By default, persistent database and uploaded files in ProgramData are preserved to prevent accidental data loss.
  ; Ask the user if they explicitly wish to delete all sales data and database files.
  SetShellVarContext all
  ReadEnvStr $R0 "ProgramData"
  StrCmp $R0 "" 0 +2
  StrCpy $R0 "$APPDATA"
  StrCmp $R0 "" 0 +2
  StrCpy $R0 "C:\ProgramData"
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "هل ترغب في حذف جميع بيانات المبيعات وقاعدة البيانات والملفات نهائياً من الجهاز؟$\n$\nDo you want to permanently delete all database records, sales data, and uploaded product images from ProgramData?$\n$\n(اختر 'لا' للحفاظ على بياناتك لاستعادتها عند إعادة التثبيت / Choose 'No' to preserve your database for future installations.)" IDNO keep_data
  RMDir /r "$R0\Bebyoon System"
  DetailPrint "Removed all database and application data from ProgramData."
  Goto done_uninstall
keep_data:
  DetailPrint "Preserved user database and sales data in: $R0\Bebyoon System"
done_uninstall:
!macroend
