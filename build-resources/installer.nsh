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
  ${If} ${isUpdated}
    CreateDirectory "$APPDATA\ServerLab MC\logs"
    FileOpen $0 "$APPDATA\ServerLab MC\logs\uninstall.log" a
    FileWrite $0 "[${__DATE__} ${__TIME__}] update cleanup: keeping user data\r\n"
    FileClose $0
    Goto unDataCleanupDone
  ${EndIf}

  CreateDirectory "$APPDATA\ServerLab MC\logs"
  FileOpen $0 "$APPDATA\ServerLab MC\logs\uninstall.log" a
  FileWrite $0 "[${__DATE__} ${__TIME__}] uninstall requested\r\n"

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Remove ServerLab MC settings and preferences?\r\n\r\nChoose No to keep them for a future reinstall." \
    IDYES removeSettings
  FileWrite $0 "settings=keep\r\n"
  Goto settingsDone
removeSettings:
  FileWrite $0 "settings=remove\r\n"
  RMDir /r "$APPDATA\ServerLab MC\settings"
settingsDone:

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Remove downloaded server software and managed Java runtimes?\r\n\r\nCached files can be downloaded again after reinstalling." \
    IDYES removeCache
  FileWrite $0 "cache=keep\r\n"
  Goto cacheDone
removeCache:
  FileWrite $0 "cache=remove\r\n"
  RMDir /r "$APPDATA\ServerLab MC\software-cache"
  RMDir /r "$APPDATA\ServerLab MC\java-runtimes"
cacheDone:

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Remove ServerLab MC logs and error history?" \
    IDYES removeLogs
  FileWrite $0 "logs=keep\r\n"
  StrCpy $1 "keep"
  Goto logsDone
removeLogs:
  FileWrite $0 "logs=remove\r\n"
  StrCpy $1 "remove"
logsDone:

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Remove templates?" \
    IDYES removeTemplates
  FileWrite $0 "templates=keep\r\n"
  Goto templatesDone
removeTemplates:
  FileWrite $0 "templates=remove\r\n"
  RMDir /r "$APPDATA\ServerLab MC\templates"
templatesDone:

  MessageBox MB_YESNO|MB_ICONEXCLAMATION \
    "Remove Minecraft servers, worlds, plugins, mods, and configurations? This cannot be undone." \
    IDYES removeServers
  FileWrite $0 "servers=keep\r\n"
  Goto serversDone
removeServers:
  FileWrite $0 "servers=remove\r\n"
  RMDir /r "$APPDATA\ServerLab MC\servers"
serversDone:

  MessageBox MB_YESNO|MB_ICONEXCLAMATION \
    "Remove all ServerLab backups? This cannot be undone." \
    IDYES removeBackups
  FileWrite $0 "backups=keep\r\n"
  Goto backupsDone
removeBackups:
  FileWrite $0 "backups=remove\r\n"
  RMDir /r "$APPDATA\ServerLab MC\backups"
backupsDone:

  FileClose $0
  ${If} $1 == "remove"
    RMDir /r "$APPDATA\ServerLab MC\logs"
  ${EndIf}
  Delete "$SMPROGRAMS\ServerLab MC\Uninstall ServerLab MC.lnk"
  RMDir "$SMPROGRAMS\ServerLab MC"
unDataCleanupDone:
!macroend
