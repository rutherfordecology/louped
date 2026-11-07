' Louped studio, started with no window, so http://localhost:7884/ works
' from a bookmark. A shortcut to this file in the Windows Startup folder
' starts it at sign-in (HOSTING.md, "The studio without a terminal").
' Output goes to run.log in the repo root. If the studio is already running,
' the second copy finds the port taken and stops.
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = root
sh.Run "cmd /c node studio\server.mjs >> run.log 2>&1", 0, False
