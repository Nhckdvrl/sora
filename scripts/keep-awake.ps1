param([string]$StatusPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'verification\awake-status.json'))
# Windows releases this process-owned request when the helper exits.
Add-Type @'
using System;
using System.IO;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class SoraAwake {
 [DllImport("kernel32.dll")] static extern uint SetThreadExecutionState(uint flags);
 public static void Run(string statusPath) {
  bool active=SetThreadExecutionState(0x80000003)!=0;
  Directory.CreateDirectory(Path.GetDirectoryName(statusPath));
  File.WriteAllText(statusPath,"{\"active\":"+(active?"true":"false")+",\"pid\":"+Process.GetCurrentProcess().Id+",\"startedAt\":\""+DateTime.UtcNow.ToString("o")+"\"}");
  if(!active)throw new Exception("Windows did not accept the display/system request");
  try { while(true)Thread.Sleep(15000); }
  finally { SetThreadExecutionState(0x80000000); }
 }
}
'@
[SoraAwake]::Run($StatusPath)
