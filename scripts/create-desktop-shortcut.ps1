# 创建/修复 CleanC 桌面快捷方式（使用 EXE 内嵌图标，避免 PNG 白图标问题）
param(
    [string]$InstallDir = "D:\CleanC"
)

$exe = Join-Path $InstallDir "CleanC.exe"
if (-not (Test-Path $exe)) {
    Write-Error "未找到 $exe，请先安装 CleanC"
    exit 1
}

$ico = Join-Path $InstallDir "resources\icon.ico"
$buildIco = Join-Path $InstallDir "..\CleanC-release\.icon-ico\icon.ico"
if (-not (Test-Path $ico) -and (Test-Path $buildIco)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $ico) | Out-Null
    Copy-Item $buildIco $ico -Force
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "CleanC.lnk"

$wsh = New-Object -ComObject WScript.Shell
$lnk = $wsh.CreateShortcut($shortcutPath)
$lnk.TargetPath = $exe
$lnk.WorkingDirectory = $InstallDir
$lnk.Description = "CleanC - C盘清理助手"
# Windows 快捷方式必须使用 .ico 或 .exe 图标，不能使用 .png
$lnk.IconLocation = "$exe,0"
$lnk.Save()

Write-Host "已创建桌面快捷方式: $shortcutPath"
Write-Host "图标: $($lnk.IconLocation)"
