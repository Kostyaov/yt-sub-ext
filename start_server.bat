@echo off
echo ===================================================================
echo Запуск YouTube Ukrainian TTS сервера
echo ===================================================================
echo.

:: Перевірка наявності Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ПОМИЛКА] Python не знайдено!
    echo Будь ласка, встановіть Python 3.8 або новіше з https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

:: Перехід до папки сервера (якщо сервер у підпапці server)
cd /d "%~dp0edge-tts-server"

:: Запуск сервера
echo Запуск сервера... Будь ласка, не закривайте це вікно!
echo.
echo ===================================================================
echo.
python server.py

:: Якщо сервер завершив роботу
echo.
echo Сервер зупинено.
pause