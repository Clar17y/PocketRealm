@echo off
REM Process all pixelated PNGs: preserve/restore transparency, resize to 128x128, apply color palette, output as WebP
REM Run from the docs/assets folder

REM First, create the palette image if it doesn't exist
if not exist palette.png (
    echo Creating palette.png...
    magick -size 1x1 xc:"#0a0a0c" xc:"#2a2a3a" xc:"#5a5a6a" xc:"#9a9aaa" xc:"#e8e8e0" xc:"#3d2618" xc:"#6b4423" xc:"#a67c52" xc:"#d4b896" xc:"#3a3d4a" xc:"#6a7080" xc:"#a8b0b8" xc:"#d4a84b" xc:"#1e3d2a" xc:"#3d6b4a" xc:"#6aaa5a" xc:"#a8d8a0" xc:"#1a2a4a" xc:"#2a5a8a" xc:"#5aaad4" xc:"#a8d8e8" xc:"#5a1a1a" xc:"#aa3a3a" xc:"#d47a3a" xc:"#e8b090" xc:"#4a3028" xc:"#8a6048" xc:"#c8a078" xc:"#e8d0b8" xc:"#3a2a5a" xc:"#7a4a9a" xc:"#aa6ad4" +append palette.png
)

REM Common processing flags:
REM Exact-white removal: makes only pure #FFFFFF pixels transparent everywhere.
REM The game palette's lightest color is #e8e8e0, so no artwork pixel should be #FFFFFF.
set BG_REMOVE=-alpha set -fuzz 2%% -transparent white

REM Pipeline for icons (128x128 with palette remap):
REM 1) Load + clean background + resize
REM 2) Extract alpha to mpr:mask
REM 3) Quantize/remap RGB to palette (with alpha off)
REM 4) Re-apply alpha mask and output as WebP

REM Process skills (higher fuzz to catch near-white edge artifacts)
echo Processing skills...
for %%f in (skills\*-pixelated.png) do (
    echo   %%f
    magick "%%f" -alpha set -fuzz 8%% -transparent white -filter point -resize 128x128 ^
      ^( +clone -alpha extract -write mpr:mask +delete ^) ^
      -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
      -quality 80 "skills\%%~nf-128.webp"
)

REM Process items
echo Processing items...
for %%f in (items\*-pixelated.png) do (
    echo   %%f
    magick "%%f" %BG_REMOVE% -filter point -resize 128x128 ^
      ^( +clone -alpha extract -write mpr:mask +delete ^) ^
      -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
      -quality 80 "items\%%~nf-128.webp"
)

REM Process monsters
echo Processing monsters...
for %%f in (monsters\*-pixelated.png) do (
    echo   %%f
    magick "%%f" %BG_REMOVE% -filter point -resize 128x128 ^
      ^( +clone -alpha extract -write mpr:mask +delete ^) ^
      -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
      -quality 80 "monsters\%%~nf-128.webp"
)

REM Process consumables
echo Processing consumables...
for %%f in (consumables\*-pixelated.png) do (
    echo   %%f
    magick "%%f" %BG_REMOVE% -filter point -resize 128x128 ^
      ^( +clone -alpha extract -write mpr:mask +delete ^) ^
      -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
      -quality 80 "consumables\%%~nf-128.webp"
)

REM Process ui
echo Processing ui...
for %%f in (ui\*-pixelated.png) do (
    echo   %%f
    magick "%%f" %BG_REMOVE% -filter point -resize 128x128 ^
      ^( +clone -alpha extract -write mpr:mask +delete ^) ^
      -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
      -quality 80 "ui\%%~nf-128.webp"
)

REM Process resources
echo Processing resources...
for %%f in (resources\*-pixelated.png) do (
    echo   %%f
    magick "%%f" %BG_REMOVE% -filter point -resize 128x128 ^
      ^( +clone -alpha extract -write mpr:mask +delete ^) ^
      -alpha off -dither None -remap palette.png mpr:mask -alpha off -compose CopyOpacity -composite ^
      -quality 80 "resources\%%~nf-128.webp"
)

REM Process zones (no resize, no palette remap — just convert to WebP)
echo Processing zones...
for %%f in (zones\zone_*.png) do (
    echo   %%f
    magick "%%f" -quality 80 "zones\%%~nf.webp"
)

REM Process screens (no resize, no palette remap — just convert to WebP)
echo Processing screens...
if exist screens (
    for %%f in (screens\screen_*.png) do (
        echo   %%f
        magick "%%f" -quality 80 "screens\%%~nf.webp"
    )
)


REM Copy processed files to web app public assets
echo.
echo Copying to apps/web/public/assets...
set DEST=..\..\apps\web\public\assets

xcopy /y "skills\*-pixelated-128.webp" "%DEST%\skills\" >nul
xcopy /y "items\*-pixelated-128.webp" "%DEST%\items\" >nul
xcopy /y "monsters\*-pixelated-128.webp" "%DEST%\monsters\" >nul
xcopy /y "consumables\*-pixelated-128.webp" "%DEST%\consumables\" >nul
xcopy /y "ui\*-pixelated-128.webp" "%DEST%\ui\" >nul
xcopy /y "resources\*-pixelated-128.webp" "%DEST%\resources\" >nul
xcopy /y "zones\zone_*.webp" "%DEST%\zones\" >nul
if exist screens (
    if not exist "%DEST%\screens" mkdir "%DEST%\screens"
    xcopy /y "screens\screen_*.webp" "%DEST%\screens\" >nul
)

echo Done!
pause
