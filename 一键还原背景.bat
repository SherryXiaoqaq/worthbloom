@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  正在把背景还原成修改前的样子...
echo.
copy /y "_backup\bg-before\globals.css" "app\globals.css" >nul
copy /y "_backup\bg-before\worthbloom-v2.module.css" "app\worthbloom-v2.module.css" >nul
copy /y "_backup\bg-before\review-stamp-v2.module.css" "app\review-stamp-v2.module.css" >nul
echo.
echo  还原完成！请在浏览器按 Ctrl+F5 刷新查看。
echo.
pause
