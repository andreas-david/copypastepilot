@echo off
title EasyCopy
echo EasyCopy wird gestartet. Dieses Fenster nicht schliessen, solange du EasyCopy nutzt.
echo.
call npx --yes @andreasdavid/easycopy@latest
echo.
echo EasyCopy wurde beendet oder ist nicht gestartet. Falls Fehler oben stehen, schicke sie dem Entwickler.
pause
