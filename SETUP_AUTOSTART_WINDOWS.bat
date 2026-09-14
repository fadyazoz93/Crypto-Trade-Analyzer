@echo off
chcp 65001 > nul
title Fady Crypto Analyzer - Auto-Start on Windows Boot

cls
echo =====================================================================
echo    تفعيل التشغيل التلقائي عند إقلاع الويندوز (Auto-Start on Boot)
echo =====================================================================
echo.

set SCRIPT_DIR=%~dp0
set BATCH_PATH=%SCRIPT_DIR%START_24_7_SCANNER.bat
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_VBS=%TEMP%\CreateShortcut.vbs

echo [*] جاري إضافة اختصار التشغيل التلقائي إلى مجلد بدء التشغيل:
echo     %STARTUP_DIR%
echo.

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%SHORTCUT_VBS%"
echo sLinkFile = "%STARTUP_DIR%\FadyCryptoScanner24_7.lnk" >> "%SHORTCUT_VBS%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%SHORTCUT_VBS%"
echo oLink.TargetPath = "%BATCH_PATH%" >> "%SHORTCUT_VBS%"
echo oLink.WorkingDirectory = "%SCRIPT_DIR%" >> "%SHORTCUT_VBS%"
echo oLink.Description = "Fady Crypto 24/7 Scanner Daemon" >> "%SHORTCUT_VBS%"
echo oLink.Save >> "%SHORTCUT_VBS%"

cscript /nologo "%SHORTCUT_VBS%"
del "%SHORTCUT_VBS%"

echo [✓] تم تفعيل التشغيل التلقائي بنجاح!
echo [*] من الآن فصاعداً، سيبدأ محرك الفحص بالعمل تلقائياً فور تشغيل السيرفر أو إعادة تشغيله (Windows Reboot).
echo.
pause
