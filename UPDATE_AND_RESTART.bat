@echo off
chcp 65001 > nul
title Fady Crypto Analyzer - Update & Restart

cls
echo =====================================================================
echo          تحديث التطبيق وإعادة التشغيل (Update & Restart)
echo =====================================================================
echo.

where git >nul 2>nul
if %errorlevel% equ 0 (
    echo [*] جاري سحب أحدث التحديثات من GitHub (git pull)...
    call git pull
) else (
    echo [*] Git غير متوفر، سيتم فقط تحديث الحزم وإعادة البناء...
)

echo.
echo [*] فحص وتحديث الحزم (npm install)...
call npm install

echo.
echo [✓] تم التحديث بنجاح!
echo [*] يمكنك الآن إغلاق هذه النافذة وتشغيل START_24_7_SCANNER.bat
echo.
pause
