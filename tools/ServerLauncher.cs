using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;

namespace DawaCoreServerLauncher
{
    class Program
    {
        static bool IsPortListening(int port)
        {
            try
            {
                IPGlobalProperties ipProps = IPGlobalProperties.GetIPGlobalProperties();
                IPEndPoint[] listeners = ipProps.GetActiveTcpListeners();
                foreach (IPEndPoint ep in listeners)
                {
                    if (ep.Port == port) return true;
                }
            }
            catch { }
            return false;
        }

        static string FindAppDir()
        {
            string exeDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            if (File.Exists(Path.Combine(exeDir, "dist", "main.js")))
            {
                return exeDir;
            }
            if (File.Exists(@"C:\DawaCore\dist\main.js"))
            {
                return @"C:\DawaCore";
            }
            if (File.Exists(@"D:\DawaCore\dist\main.js"))
            {
                return @"D:\DawaCore";
            }
            if (File.Exists(@"E:\DawaCore\dist\main.js"))
            {
                return @"E:\DawaCore";
            }
            return @"C:\DawaCore";
        }

        static void Main(string[] args)
        {
            try
            {
                Console.OutputEncoding = Encoding.UTF8;
            }
            catch { }

            Console.Title = "DawaCore Central Server Launcher";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("========================================================");
            Console.WriteLine("        DawaCore - Central Server & POS Launcher        ");
            Console.WriteLine("========================================================");
            Console.ResetColor();

            string appDir = FindAppDir();
            if (!Directory.Exists(appDir) || !File.Exists(Path.Combine(appDir, "dist", "main.js")))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[ERROR] DawaCore installation not found at: " + appDir);
                Console.ResetColor();
                Console.WriteLine("Press Enter to exit...");
                Console.ReadLine();
                return;
            }

            Console.WriteLine("[1/4] Application folder: " + appDir);

            // Copy self into C:\DawaCore\Start_DawaCore_Server.exe so shortcuts always point to a permanent location
            string currentExe = Assembly.GetExecutingAssembly().Location;
            string installedExe = Path.Combine(appDir, "Start_DawaCore_Server.exe");
            try
            {
                if (!string.Equals(Path.GetFullPath(currentExe), Path.GetFullPath(installedExe), StringComparison.OrdinalIgnoreCase))
                {
                    File.Copy(currentExe, installedExe, true);
                }
            }
            catch { }

            // Ensure backup directory exists
            try
            {
                if (!Directory.Exists(@"C:\DawaCore_Backups"))
                {
                    Directory.CreateDirectory(@"C:\DawaCore_Backups");
                }
            }
            catch { }

            // Create watchdog batch script (runs server in infinite auto-recovery loop + takes backup)
            string watchdogBat = Path.Combine(appDir, "dawacore-watchdog.bat");
            string silentVbs = Path.Combine(appDir, "start-silent-server.vbs");
            try
            {
                string batContent =
                    "@echo off\r\n" +
                    "cd /d \"" + appDir + "\"\r\n" +
                    "set \"PATH=C:\\Program Files\\nodejs;%PATH%\"\r\n" +
                    "for /d %%d in (\"C:\\Program Files\\PostgreSQL\\*\") do (\r\n" +
                    "    if exist \"%%d\\bin\\pg_dump.exe\" set \"PATH=%%d\\bin;%PATH%\"\r\n" +
                    ")\r\n" +
                    "for /d %%d in (\"C:\\PostgreSQL\\*\") do (\r\n" +
                    "    if exist \"%%d\\bin\\pg_dump.exe\" set \"PATH=%%d\\bin;%PATH%\"\r\n" +
                    ")\r\n" +
                    "set \"NODE_ENV=production\"\r\n" +
                    "set \"HOST=0.0.0.0\"\r\n" +
                    "set \"PORT=3002\"\r\n" +
                    "node tools\\backup-db.cjs >nul 2>&1\r\n" +
                    ":SERVER_LOOP\r\n" +
                    "node dist\\main.js\r\n" +
                    "timeout /t 3 /nobreak >nul\r\n" +
                    "goto SERVER_LOOP\r\n";
                File.WriteAllText(watchdogBat, batContent, Encoding.ASCII);

                string vbsContent =
                    "Set WshShell = CreateObject(\"WScript.Shell\")\r\n" +
                    "WshShell.Run chr(34) & \"" + watchdogBat + "\" & chr(34), 0, False\r\n" +
                    "Set WshShell = Nothing\r\n";
                File.WriteAllText(silentVbs, vbsContent, Encoding.ASCII);
            }
            catch { }

            // Create Desktop Shortcut & Windows Startup Shortcut (Auto-Start when PC turns on!)
            Console.WriteLine("[2/4] Verifying Desktop Icon & Auto-Start on Windows Boot...");
            try
            {
                string psShortcutCmd =
                    "$wsh = New-Object -ComObject WScript.Shell; " +
                    "$desk = $wsh.SpecialFolders.Item('Desktop'); " +
                    "if ($desk) { " +
                    "  $s = $wsh.CreateShortcut((Join-Path $desk 'DawaCore.lnk')); " +
                    "  $s.TargetPath = '" + installedExe + "'; " +
                    "  $s.WorkingDirectory = '" + appDir + "'; " +
                    "  $s.Description = 'DawaCore Central Server & POS'; " +
                    "  $ico = '" + Path.Combine(appDir, @"frontend\public\favicon.ico") + "'; " +
                    "  if (Test-Path $ico) { $s.IconLocation = \"$ico, 0\" }; " +
                    "  $s.Save(); " +
                    "  $b = $wsh.CreateShortcut((Join-Path $desk 'DawaCore Backup.lnk')); " +
                    "  $b.TargetPath = '" + Path.Combine(appDir, "backup-db.bat") + "'; " +
                    "  $b.WorkingDirectory = '" + appDir + "'; " +
                    "  $b.Save(); " +
                    "}; " +
                    "$startup = $wsh.SpecialFolders.Item('Startup'); " +
                    "if ($startup) { " +
                    "  $st = $wsh.CreateShortcut((Join-Path $startup 'DawaCore_AutoStart.lnk')); " +
                    "  $st.TargetPath = 'wscript.exe'; " +
                    "  $st.Arguments = '\"' + '" + silentVbs + "' + '\"'; " +
                    "  $st.WorkingDirectory = '" + appDir + "'; " +
                    "  $st.Save(); " +
                    "}";

                ProcessStartInfo psPsi = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"" + psShortcutCmd + "\"");
                psPsi.CreateNoWindow = true;
                psPsi.UseShellExecute = false;
                Process p = Process.Start(psPsi);
                if (p != null) p.WaitForExit(4000);
            }
            catch { }

            // Ensure PostgreSQL service is running if stopped
            try
            {
                ProcessStartInfo pgPsi = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"Get-Service postgresql* -ErrorAction SilentlyContinue | Where-Object { $_.Status -ne 'Running' } | Start-Service -ErrorAction SilentlyContinue\"");
                pgPsi.CreateNoWindow = true;
                pgPsi.UseShellExecute = false;
                Process pgProc = Process.Start(pgPsi);
                if (pgProc != null) pgProc.WaitForExit(3000);
            }
            catch { }

            // Check if server is already listening on port 3002
            if (IsPortListening(3002))
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("[3/4] DawaCore Server is ALREADY running on port 3002!");
                Console.ResetColor();
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[3/4] Starting DawaCore Background Server on port 3002...");
                Console.ResetColor();

                ProcessStartInfo vbsPsi = new ProcessStartInfo("wscript.exe", "\"" + silentVbs + "\"");
                vbsPsi.WorkingDirectory = appDir;
                vbsPsi.UseShellExecute = false;
                Process.Start(vbsPsi);

                // Wait up to 8 seconds for port 3002 to come online
                for (int i = 0; i < 16; i++)
                {
                    Thread.Sleep(500);
                    if (IsPortListening(3002))
                    {
                        break;
                    }
                    Console.Write(".");
                }
                Console.WriteLine();

                if (IsPortListening(3002))
                {
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("[OK] DawaCore Server started and is ready!");
                    Console.ResetColor();
                }
                else
                {
                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine("[INFO] Server is initializing... Opening browser shortly.");
                    Console.ResetColor();
                }
            }

            // Print LAN IP addresses for the 4 POS machines
            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("========================================================");
            Console.WriteLine("  Server URL (on this PC) : http://localhost:3002");
            try
            {
                string hostName = Dns.GetHostName();
                IPAddress[] addresses = Dns.GetHostAddresses(hostName);
                foreach (IPAddress ip in addresses)
                {
                    if (ip.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip))
                    {
                        Console.WriteLine("  POS Terminals URL       : http://" + ip.ToString() + ":3002");
                    }
                }
            }
            catch { }
            Console.WriteLine("  Backups Folder          : C:\\DawaCore_Backups");
            Console.WriteLine("========================================================");
            Console.ResetColor();

            Console.WriteLine("[4/4] Opening DawaCore in browser...");
            try
            {
                Process.Start("http://localhost:3002");
            }
            catch { }

            Thread.Sleep(2000);
        }
    }
}
