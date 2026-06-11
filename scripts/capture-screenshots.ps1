Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

namespace CleanCShot {
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  public static class Native {
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);

    public static IntPtr Found = IntPtr.Zero;

    public static bool Callback(IntPtr hWnd, IntPtr lParam) {
      if (!IsWindowVisible(hWnd)) return true;
      var sb = new StringBuilder(256);
      GetWindowText(hWnd, sb, 256);
      string title = sb.ToString();
      if (title.StartsWith("CleanC") && !title.Contains("Developer Tools")) { Found = hWnd; return false; }
      return true;
    }

    public static IntPtr FindCleanC() {
      Found = IntPtr.Zero;
      EnumWindows(Callback, IntPtr.Zero);
      return Found;
    }

    public static void Click(int x, int y) {
      SetCursorPos(x, y);
      System.Threading.Thread.Sleep(150);
      mouse_event(0x0002, 0, 0, 0, 0);
      System.Threading.Thread.Sleep(80);
      mouse_event(0x0004, 0, 0, 0, 0);
    }
  }
}
'@

function Capture-Window([IntPtr]$hwnd, [string]$outPath) {
  [void][CleanCShot.Native]::SetForegroundWindow($hwnd)
  Start-Sleep -Milliseconds 400
  $rect = New-Object CleanCShot.RECT
  [void][CleanCShot.Native]::GetWindowRect($hwnd, [ref]$rect)
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bmp)
  $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($width, $height)))
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bmp.Dispose()
}

$hwnd = [CleanCShot.Native]::FindCleanC()
if ($hwnd -eq [IntPtr]::Zero) { throw 'CleanC window not found' }

$rect = New-Object CleanCShot.RECT
[void][CleanCShot.Native]::GetWindowRect($hwnd, [ref]$rect)
$left = $rect.Left
$top = $rect.Top

# 新版分组侧边栏的导航项中心坐标（相对窗口左上角）
# 布局: Logo 64px + nav 上边距 12px；分组标题约 27px；导航项高 40px + 间距 2px；组间距 8px
$navX = $left + 110

$shots = @(
  @{ name = 'dashboard';        y = 123;  wait = 2500 },  # 总览 > 仪表盘
  @{ name = 'detective';        y = 240;  wait = 4500 },  # 清理瘦身 > 占用侦探
  @{ name = 'software-migrate'; y = 357;  wait = 4500 },  # 迁移扩容 > 软件迁移
  @{ name = 'ai-assistant';     y = 474;  wait = 2500 }   # 智能守护 > AI 助手
)

$outDir = Join-Path $PSScriptRoot '..\docs\screenshots'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

foreach ($shot in $shots) {
  [void][CleanCShot.Native]::SetForegroundWindow($hwnd)
  Start-Sleep -Milliseconds 300
  [CleanCShot.Native]::Click($navX, ($top + $shot.y))
  Start-Sleep -Milliseconds $shot.wait
  Capture-Window $hwnd (Join-Path $outDir ($shot.name + '.png'))
  Write-Host "Saved $($shot.name).png"
}
