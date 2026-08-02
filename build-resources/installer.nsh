!macro customInstall
  CreateDirectory "$SMPROGRAMS\ServerLab MC"
  CreateShortCut "$SMPROGRAMS\ServerLab MC\Uninstall ServerLab MC.lnk" "$INSTDIR\Uninstall ServerLab MC.exe"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\ServerLab MC\Uninstall ServerLab MC.lnk"
  RMDir "$SMPROGRAMS\ServerLab MC"
!macroend
