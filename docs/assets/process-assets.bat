@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM Process pixelated PNG assets. Optional usage:
REM   process-assets.bat
REM   process-assets.bat items
REM   process-assets.bat items item_wayfinder_buckler-pixelated.png
REM Run from the docs/assets folder

set "TARGET_FOLDER=%~1"
set "TARGET_FILE=%~2"
set "DEST=..\..\apps\web\public\assets"
set "VALID_TARGET=false"

if not "%~3"=="" goto :usage
if defined TARGET_FILE if not defined TARGET_FOLDER goto :usage

if not defined TARGET_FOLDER goto :validated
for %%D in (skills items monsters consumables ui resources zones screens) do (
    if /I "%%D"=="%TARGET_FOLDER%" set "VALID_TARGET=true"
)
if /I "%VALID_TARGET%"=="false" goto :usage

:validated
if not exist palette.png (
    echo Creating palette.png...
    magick -size 1x1 xc:"#0a0a0c" xc:"#2a2a3a" xc:"#5a5a6a" xc:"#9a9aaa" xc:"#e8e8e0" xc:"#3d2618" xc:"#6b4423" xc:"#a67c52" xc:"#d4b896" xc:"#3a3d4a" xc:"#6a7080" xc:"#a8b0b8" xc:"#d4a84b" xc:"#1e3d2a" xc:"#3d6b4a" xc:"#6aaa5a" xc:"#a8d8a0" xc:"#1a2a4a" xc:"#2a5a8a" xc:"#5aaad4" xc:"#a8d8e8" xc:"#5a1a1a" xc:"#aa3a3a" xc:"#d47a3a" xc:"#e8b090" xc:"#4a3028" xc:"#8a6048" xc:"#c8a078" xc:"#e8d0b8" xc:"#3a2a5a" xc:"#7a4a9a" xc:"#aa6ad4" +append palette.png
)

set BG_REMOVE=-alpha set -fuzz 2%% -transparent white

:process_skills
if defined TARGET_FOLDER if /I not "%TARGET_FOLDER%"=="skills" goto :process_items
echo Processing skills...
set "MATCHED=false"
if defined TARGET_FILE (
    if exist "skills\%TARGET_FILE%" (
        set "MATCHED=true"
        echo   skills\%TARGET_FILE%
        magick "skills\%TARGET_FILE%" -alpha set -fuzz 8%% -transparent white -filter point -resize 128x128 ^
          ^( +clone -alpha extract -write mpr:mask +delete ^) ^
          -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
          -quality 80 "skills\%~n2-128.webp"
    ) else (
        echo No matching file found for skills\%TARGET_FILE%
        exit /b 1
    )
) else (
    for %%f in (skills\*-pixelated.png) do (
        set "MATCHED=true"
        echo   %%f
        magick "%%f" -alpha set -fuzz 8%% -transparent white -filter point -resize 128x128 ^
          ^( +clone -alpha extract -write mpr:mask +delete ^) ^
          -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
          -quality 80 "skills\%%~nf-128.webp"
    )
)
if /I "!MATCHED!"=="true" (
    if not defined TARGET_FILE (
        echo Copying skills to apps/web/public/assets...
        if not exist "%DEST%\skills" mkdir "%DEST%\skills" >nul 2>nul
        xcopy /i /y "skills\*-pixelated-128.webp" "%DEST%\skills\" >nul
    )
)

:process_items
if defined TARGET_FOLDER if /I not "%TARGET_FOLDER%"=="items" goto :process_monsters
echo Processing items...
set "MATCHED=false"
if defined TARGET_FILE (
    if exist "items\%TARGET_FILE%" (
        set "MATCHED=true"
        echo   items\%TARGET_FILE%
        magick "items\%TARGET_FILE%" %BG_REMOVE% -filter point -resize 128x128 ^
          ^( +clone -alpha extract -write mpr:mask +delete ^) ^
          -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
          -quality 80 "items\%~n2-128.webp"
    ) else (
        echo No matching file found for items\%TARGET_FILE%
        exit /b 1
    )
) else (
    for %%f in (items\*-pixelated.png) do (
        set "MATCHED=true"
        echo   %%f
        magick "%%f" %BG_REMOVE% -filter point -resize 128x128 ^
          ^( +clone -alpha extract -write mpr:mask +delete ^) ^
          -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
          -quality 80 "items\%%~nf-128.webp"
    )
)
if /I "!MATCHED!"=="true" (
    if not defined TARGET_FILE (
        echo Copying items to apps/web/public/assets...
        if not exist "%DEST%\items" mkdir "%DEST%\items" >nul 2>nul
        xcopy /i /y "items\*-pixelated-128.webp" "%DEST%\items\" >nul
    )
)

:process_monsters
if defined TARGET_FOLDER if /I not "%TARGET_FOLDER%"=="monsters" goto :process_consumables
echo Processing monsters...
set "MATCHED=false"
if defined TARGET_FILE (
    if exist "monsters\%TARGET_FILE%" (
        set "MATCHED=true"
        echo   monsters\%TARGET_FILE%
        magick "monsters\%TARGET_FILE%" %BG_REMOVE% -filter point -resize 128x128 ^
          ^( +clone -alpha extract -write mpr:mask +delete ^) ^
          -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
          -quality 80 "monsters\%~n2-128.webp"
    ) else (
        echo No matching file found for monsters\%TARGET_FILE%
        exit /b 1
    )
) else (
    for %%f in (monsters\*-pixelated.png) do (
        set "MATCHED=true"
        echo   %%f
        magick "%%f" %BG_REMOVE% -filter point -resize 128x128 ^
          ^( +clone -alpha extract -write mpr:mask +delete ^) ^
          -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
          -quality 80 "monsters\%%~nf-128.webp"
    )
)
if /I "!MATCHED!"=="true" (
    if not defined TARGET_FILE (
        echo Copying monsters to apps/web/public/assets...
        if not exist "%DEST%\monsters" mkdir "%DEST%\monsters" >nul 2>nul
        xcopy /i /y "monsters\*-pixelated-128.webp" "%DEST%\monsters\" >nul
    )
)

:process_consumables
if defined TARGET_FOLDER if /I not "%TARGET_FOLDER%"=="consumables" goto :process_ui
echo Processing consumables...
set "MATCHED=false"
if defined TARGET_FILE (
    if exist "consumables\%TARGET_FILE%" (
        set "MATCHED=true"
        echo   consumables\%TARGET_FILE%
        magick "consumables\%TARGET_FILE%" %BG_REMOVE% -filter point -resize 128x128 ^
          ^( +clone -alpha extract -write mpr:mask +delete ^) ^
          -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
          -quality 80 "consumables\%~n2-128.webp"
    ) else (
        echo No matching file found for consumables\%TARGET_FILE%
        exit /b 1
    )
) else (
    for %%f in (consumables\*-pixelated.png) do (
        set "MATCHED=true"
        echo   %%f
        magick "%%f" %BG_REMOVE% -filter point -resize 128x128 ^
          ^( +clone -alpha extract -write mpr:mask +delete ^) ^
          -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
          -quality 80 "consumables\%%~nf-128.webp"
    )
)
if /I "!MATCHED!"=="true" (
    if not defined TARGET_FILE (
        echo Copying consumables to apps/web/public/assets...
        if not exist "%DEST%\consumables" mkdir "%DEST%\consumables" >nul 2>nul
        xcopy /i /y "consumables\*-pixelated-128.webp" "%DEST%\consumables\" >nul
    )
)

:process_ui
if defined TARGET_FOLDER if /I not "%TARGET_FOLDER%"=="ui" goto :process_resources
echo Processing ui...
set "MATCHED=false"
if defined TARGET_FILE (
    if exist "ui\%TARGET_FILE%" (
        set "MATCHED=true"
        echo   ui\%TARGET_FILE%
        magick "ui\%TARGET_FILE%" %BG_REMOVE% -filter point -resize 128x128 ^
          ^( +clone -alpha extract -write mpr:mask +delete ^) ^
          -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
          -quality 80 "ui\%~n2-128.webp"
    ) else (
        echo No matching file found for ui\%TARGET_FILE%
        exit /b 1
    )
) else (
    for %%f in (ui\*-pixelated.png) do (
        set "MATCHED=true"
        echo   %%f
        magick "%%f" %BG_REMOVE% -filter point -resize 128x128 ^
          ^( +clone -alpha extract -write mpr:mask +delete ^) ^
          -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
          -quality 80 "ui\%%~nf-128.webp"
    )
)
if /I "!MATCHED!"=="true" (
    if not defined TARGET_FILE (
        echo Copying ui to apps/web/public/assets...
        if not exist "%DEST%\ui" mkdir "%DEST%\ui" >nul 2>nul
        xcopy /i /y "ui\*-pixelated-128.webp" "%DEST%\ui\" >nul
    )
)

:process_resources
if defined TARGET_FOLDER if /I not "%TARGET_FOLDER%"=="resources" goto :process_zones
echo Processing resources...
set "MATCHED=false"
if defined TARGET_FILE (
    if exist "resources\%TARGET_FILE%" (
        set "MATCHED=true"
        echo   resources\%TARGET_FILE%
        magick "resources\%TARGET_FILE%" %BG_REMOVE% -filter point -resize 128x128 ^
          ^( +clone -alpha extract -write mpr:mask +delete ^) ^
          -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
          -quality 80 "resources\%~n2-128.webp"
    ) else (
        echo No matching file found for resources\%TARGET_FILE%
        exit /b 1
    )
) else (
    for %%f in (resources\*-pixelated.png) do (
        set "MATCHED=true"
        echo   %%f
        magick "%%f" %BG_REMOVE% -filter point -resize 128x128 ^
          ^( +clone -alpha extract -write mpr:mask +delete ^) ^
          -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
          -quality 80 "resources\%%~nf-128.webp"
    )
)
if /I "!MATCHED!"=="true" (
    if not defined TARGET_FILE (
        echo Copying resources to apps/web/public/assets...
        if not exist "%DEST%\resources" mkdir "%DEST%\resources" >nul 2>nul
        xcopy /i /y "resources\*-pixelated-128.webp" "%DEST%\resources\" >nul
    )
)

:process_zones
if defined TARGET_FOLDER if /I not "%TARGET_FOLDER%"=="zones" goto :process_screens
echo Processing zones...
set "MATCHED=false"
if defined TARGET_FILE (
    if exist "zones\%TARGET_FILE%" (
        set "MATCHED=true"
        echo   zones\%TARGET_FILE%
        magick "zones\%TARGET_FILE%" -quality 80 "zones\%~n2.webp"
    ) else (
        echo No matching file found for zones\%TARGET_FILE%
        exit /b 1
    )
) else (
    for %%f in (zones\zone_*.png) do (
        set "MATCHED=true"
        echo   %%f
        magick "%%f" -quality 80 "zones\%%~nf.webp"
    )
)
if /I "!MATCHED!"=="true" (
    if not defined TARGET_FILE (
        echo Copying zones to apps/web/public/assets...
        if not exist "%DEST%\zones" mkdir "%DEST%\zones" >nul 2>nul
        xcopy /i /y "zones\zone_*.webp" "%DEST%\zones\" >nul
    )
)

:process_screens
if defined TARGET_FOLDER if /I not "%TARGET_FOLDER%"=="screens" goto :done
if not exist screens goto :done
echo Processing screens...
set "MATCHED=false"
if defined TARGET_FILE (
    if exist "screens\%TARGET_FILE%" (
        set "MATCHED=true"
        echo   screens\%TARGET_FILE%
        magick "screens\%TARGET_FILE%" -quality 80 "screens\%~n2.webp"
    ) else (
        echo No matching file found for screens\%TARGET_FILE%
        exit /b 1
    )
) else (
    for %%f in (screens\screen_*.png) do (
        set "MATCHED=true"
        echo   %%f
        magick "%%f" -quality 80 "screens\%%~nf.webp"
    )
)
if /I "!MATCHED!"=="true" (
    if not defined TARGET_FILE (
        echo Copying screens to apps/web/public/assets...
        if not exist "%DEST%\screens" mkdir "%DEST%\screens" >nul 2>nul
        xcopy /i /y "screens\screen_*.webp" "%DEST%\screens\" >nul
    )
)

:done
echo.
echo Done!
pause
exit /b 0

:usage
echo Usage:
echo   process-assets.bat
echo   process-assets.bat ^<folder^>
echo   process-assets.bat ^<folder^> ^<filename^>
echo.
echo Valid folders: skills items monsters consumables ui resources zones screens
exit /b 1
