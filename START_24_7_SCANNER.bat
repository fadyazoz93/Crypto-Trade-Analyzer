@echo off
chcp 65001 > nul
title Fady Crypto Analyzer - 24/7 Autonomous Scanner Daemon

cls
echo =====================================================================
echo       FADY CRYPTO ANALYZER - 24/7 BACKGROUND TRADING SCANNER        
echo =====================================================================
echo   [+] OKX Live Feeds (REST & WebSocket)
echo   [+] Gann + Wyckoff + Sq9 (6-Gate SOP Engine)
echo   [+] Telegram Bot Real-time Alerts: CONNECTED
echo   [+] Turso Cloud Database: CONNECTED
echo =====================================================================
echo.

:: 1. Verify Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] خطأ: برنامج Node.js غير مثبت على هذا السيرفر!
    echo [!] Error: Node.js is not found on this Windows VPS.
    echo.
    echo يرجى تحميل وتثبيت Node.js (نسخة LTS) من الموقع الرسمي:
    echo Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Check if node_modules and tsx exist, otherwise install dependencies
if not exist "node_modules\" (
    echo [*] جاري تثبيت الحزم والمكتبات للمرة الأولى (Installing dependencies)...
    call npm install
    if %errorlevel% neq 0 (
        echo [!] فشل تثبيت المكتبات. يرجى التأكد من اتصال الإنترنت.
        pause
        exit /b 1
    )
    echo [✓] تم تثبيت الحزم بنجاح.
    echo.
) else (
    if not exist "node_modules\tsx\" (
        echo [*] جاري استكمال تثبيت حزمة tsx المطلوبة لتشغيل السيرفر...
        call npm install
    )
)

:: 3. Check if server is already running on port 3000
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>nul
if %errorlevel% equ 0 (
    echo.
    echo =====================================================================
    echo  [!] تنبيه: السيرفر يعمل بالفعل على المنفذ 3000 في نافذة أخرى!
    echo  [!] Warning: Port 3000 is already in use by another running window.
    echo.
    echo  تطبيق التداول والماسح 24/7 يعمل الآن بالفعل في الخلفية ويرسل لتليجرام.
    echo  تم منع فتح نافذة مكررة لتفادي إرسال نفس الإشارة مرتين لنفس العملة.
    echo.
    echo  إذا أردت إعادة تشغيله، يرجى إغلاق النافذة السابقة أولاً.
    echo =====================================================================
    echo.
    pause
    exit /b 0
)

:: 4. Launch Server with Auto-Restart Protection Loop
:run_loop
echo.
echo =====================================================================
echo  [*] جاري تشغيل خادم الفحص الخلفي 24/7 على المنفذ 3000...
echo  [*] Starting 24/7 Scanner Daemon on http://localhost:3000
echo  [*] (يمكنك تصغير هذه النافذة وتركها تعمل في الخلفية بأمان)
echo =====================================================================
echo.

call npm run dev

echo.
echo [!] تم إغلاق السيرفر أو حدث انقطاع مفاجئ.
echo [*] سيتم إعادة التشغيل التلقائي بعد 5 ثوانٍ لحماية استمرارية الفحص 24/7...
timeout /t 5 /nobreak > nul
goto run_loop
