using System;
using System.Diagnostics;
using System.IO;

namespace DawaCoreInstaller
{
    class Program
    {
        static int Main(string[] args)
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
                string batPath = Path.Combine(baseDir, "Setup.bat");

                if (!File.Exists(batPath))
                {
                    string parentBat = Path.Combine(Directory.GetParent(baseDir).FullName, "Setup.bat");
                    if (File.Exists(parentBat))
                    {
                        batPath = parentBat;
                        baseDir = Directory.GetParent(baseDir).FullName;
                    }
                }

                if (!File.Exists(batPath))
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("[ERROR] Setup.bat was not found in: " + baseDir);
                    Console.ResetColor();
                    Console.WriteLine("Press any key to exit...");
                    Console.ReadKey();
                    return 1;
                }

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "cmd.exe";
                psi.Arguments = "/c \"\"" + batPath + "\"\"";
                psi.WorkingDirectory = baseDir;
                psi.UseShellExecute = true;
                psi.Verb = "runas"; // Windows UAC Elevation

                Process proc = Process.Start(psi);
                if (proc != null)
                {
                    proc.WaitForExit();
                    return proc.ExitCode;
                }
                return 0;
            }
            catch (Exception ex)
            {
                // If user cancels UAC prompt or an error occurs
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("\n[Notice] Setup requires administrator rights to configure PostgreSQL and System variables.");
                Console.WriteLine("Details: " + ex.Message);
                Console.ResetColor();
                Console.WriteLine("\nPress any key to exit...");
                Console.ReadKey();
                return 1;
            }
        }
    }
}
