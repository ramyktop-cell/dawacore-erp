using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Principal;
using System.Text;

namespace DawaCoreSelfExtractor
{
    class Program
    {
        static bool IsAdministrator()
        {
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                WindowsPrincipal principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
        }

        static int Main(string[] args)
        {
            try
            {
                Console.OutputEncoding = Encoding.UTF8;
                Console.InputEncoding = Encoding.UTF8;
            }
            catch { }

            if (!IsAdministrator())
            {
                try
                {
                    ProcessStartInfo elevatePsi = new ProcessStartInfo();
                    elevatePsi.FileName = Assembly.GetExecutingAssembly().Location;
                    elevatePsi.UseShellExecute = true;
                    elevatePsi.Verb = "runas";
                    Process p = Process.Start(elevatePsi);
                    if (p != null)
                    {
                        p.WaitForExit();
                        return p.ExitCode;
                    }
                    return 0;
                }
                catch (Exception ex)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("Administrator privileges are required to complete installation.");
                    Console.WriteLine(ex.Message);
                    Console.ResetColor();
                    Console.WriteLine("Press Enter to close...");
                    Console.ReadLine();
                    return 1;
                }
            }

            Console.Title = "DawaCore Clean Rebuild v1.2.0";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("========================================================");
            Console.WriteLine("     DawaCore v1.2.0 - Clean Rebuild & Configuration   ");
            Console.WriteLine("========================================================");
            Console.ResetColor();
            Console.WriteLine();

            string defaultDir = @"C:\DawaCore-New";

            Console.Write("Installation folder [Press Enter for default " + defaultDir + "]: ");
            string inputDir = Console.ReadLine();
            string targetDir = string.IsNullOrWhiteSpace(inputDir) ? defaultDir : inputDir.Trim();

            try
            {
                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }

                Console.WriteLine();
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[1/3] Extracting files to: " + targetDir + " ...");
                Console.ResetColor();

                using (Stream zipStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
                {
                    if (zipStream == null)
                    {
                        throw new Exception("Embedded payload.zip resource was not found inside the installer.");
                    }

                    using (ZipArchive archive = new ZipArchive(zipStream, ZipArchiveMode.Read))
                    {
                        int total = archive.Entries.Count;
                        int current = 0;
                        int lastPercent = -1;

                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            current++;
                            int percent = (current * 100) / (total > 0 ? total : 1);
                            if (percent != lastPercent && (percent % 5 == 0 || current == total))
                            {
                                Console.Write("\rExtracting files... [" + percent + "%] (" + current + "/" + total + ")   ");
                                lastPercent = percent;
                            }

                            string fullPath = Path.GetFullPath(Path.Combine(targetDir, entry.FullName));
                            if (!fullPath.StartsWith(Path.GetFullPath(targetDir), StringComparison.OrdinalIgnoreCase))
                            {
                                continue;
                            }

                            if (string.IsNullOrEmpty(entry.Name))
                            {
                                Directory.CreateDirectory(fullPath);
                                continue;
                            }

                            string parentDir = Path.GetDirectoryName(fullPath);
                            if (!string.IsNullOrEmpty(parentDir) && !Directory.Exists(parentDir))
                            {
                                Directory.CreateDirectory(parentDir);
                            }

                            entry.ExtractToFile(fullPath, true);
                        }
                    }
                }

                Console.WriteLine();
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("[OK] Files extracted to: " + targetDir);
                Console.ResetColor();
                Console.WriteLine();

                string configScript = Path.Combine(targetDir, "tools", "configure-install.ps1");
                if (!File.Exists(configScript))
                {
                    throw new Exception("Configuration script not found at: " + configScript);
                }

                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("[2/3] Launching Database & System Configuration Wizard...");
                Console.ResetColor();

                string psExe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");
                if (!File.Exists(psExe))
                {
                    psExe = "powershell.exe";
                }

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = psExe;
                psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + configScript + "\" -FreshDatabase";
                psi.WorkingDirectory = targetDir;
                psi.UseShellExecute = false;

                Process proc = Process.Start(psi);
                if (proc != null)
                {
                    proc.WaitForExit();
                    if (proc.ExitCode != 0)
                    {
                        Console.ForegroundColor = ConsoleColor.Red;
                        Console.WriteLine("\n[ERROR] Configuration did not complete successfully (Exit Code: " + proc.ExitCode + ").");
                        Console.WriteLine("You can re-run " + Path.Combine(targetDir, "Setup.bat") + " at any time to retry.");
                        Console.ResetColor();
                        Console.WriteLine("Press Enter to close...");
                        Console.ReadLine();
                        return proc.ExitCode;
                    }
                }

                string startBat = Path.Combine(targetDir, "start-dawacore-server.bat");
                if (File.Exists(startBat))
                {
                    Console.ForegroundColor = ConsoleColor.Cyan;
                    Console.WriteLine("\n[3/3] Starting DawaCore Server on http://localhost:3002 ...");
                    Console.ResetColor();

                    ProcessStartInfo startPsi = new ProcessStartInfo();
                    startPsi.FileName = "cmd.exe";
                    startPsi.Arguments = "/c \"" + startBat + "\"";
                    startPsi.WorkingDirectory = targetDir;
                    startPsi.UseShellExecute = false;

                    Process startProc = Process.Start(startPsi);
                    if (startProc != null)
                    {
                        startProc.WaitForExit();
                    }
                }

                return 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine();
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[Installation Error]: " + ex.Message);
                Console.ResetColor();
                Console.WriteLine("Press Enter to close...");
                Console.ReadLine();
                return 1;
            }
        }
    }
}
