@echo off
chcp 65001 > nul
title Nexus SAMP Store - Server & Discord Bot
color 0b
echo ========================================================
echo       🚀 NEXUS SAMP STORE - SERVER & DISCORD BOT
echo ========================================================
echo.
echo [1/2] กำลังเชื่อมต่อฐานข้อมูล Supabase และ Discord Bot...
echo [2/2] เว็บไซต์กำลังเปิดที่ http://localhost:3000
echo.
echo (ห้ามปิดหน้าต่างนี้ หากปิดหน้าต่างนี้ เว็บและบอทจะออฟไลน์)
echo กด Ctrl + C เพื่อหยุดการทำงาน
echo ========================================================
echo.
npm start
pause
