!include LogicLib.nsh

!macro customInstall
  CreateDirectory "$APPDATA\ServerLab MC\logs"
  FileOpen $0 "$APPDATA\ServerLab MC\logs\installer.log" a
  FileWrite $0 "[${__DATE__} ${__TIME__}] install-or-update version ${VERSION}\r\n"
  FileClose $0
  CreateDirectory "$SMPROGRAMS\ServerLab MC"
  CreateShortCut "$SMPROGRAMS\ServerLab MC\Uninstall ServerLab MC.lnk" "$INSTDIR\Uninstall ServerLab MC.exe"
!macroend

!macro customUnInstall
  CreateDirectory "$APPDATA\ServerLab MC\logs"
  FileOpen $0 "$APPDATA\ServerLab MC\logs\uninstall.log" a
  FileWrite $0 "[${__DATE__} ${__TIME__}] uninstall requested\r\n"
  FileClose $0
  Delete "$SMPROGRAMS\ServerLab MC\Uninstall ServerLab MC.lnk"
  RMDir "$SMPROGRAMS\ServerLab MC"

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Keep ServerLab MC settings, caches, logs, servers, backups, and templates?\r\n\r\nChoose Yes for a normal uninstall. Choose No to remove application settings, caches, and logs. Minecraft servers, backups, and templates are always protected." \
    IDYES keepUserData

  RMDir /r "$APPDATA\ServerLab MC\settings"
  RMDir /r "$APPDATA\ServerLab MC\software-cache"
  RMDir /r "$APPDATA\ServerLab MC\java-runtimes"
  RMDir /r "$APPDATA\ServerLab MC\logs"

keepUserData:
!macroend
