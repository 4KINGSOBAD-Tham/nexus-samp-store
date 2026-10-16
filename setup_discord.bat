@echo off
chcp 65001 > nul
title Nexus SAMP Store - Discord Auto Setup
cls
echo ========================================================
echo   NEXUS SAMP STORE - DISCORD AUTO SETUP TOOL
echo ========================================================
echo.
echo กำลังเริ่มโปรแกรมสร้างห้องและเชื่อมต่อ Discord...
echo.

node setup-discord.js

echo.
echo กดปุ่มใดๆ เพื่อปิดหน้านี้...
pause > nul
