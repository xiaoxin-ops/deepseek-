/**
 * 蓝鲸鱼 icon generation: renders the app icon (and tray variants) from an
 * inline SVG into PNGs with sharp. Outputs:
 *   app/build/icon.png            (1024×1024, electron-builder converts to .ico/.icns)
 *   app/build/tray.png            (32×32 tray icon)
 *   app/build/tray-running.png    (32×32, green status dot)
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = resolve(root, 'app', 'build')
await mkdir(buildDir, { recursive: true })

const iconSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d1b3d"/>
      <stop offset="1" stop-color="#173f80"/>
    </linearGradient>
    <linearGradient id="whale" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#63a9f7"/>
      <stop offset="1" stop-color="#2f6fd6"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="190" fill="url(#bg)"/>
  <!-- spout -->
  <g stroke="#bfe3ff" stroke-width="26" stroke-linecap="round" fill="none" opacity="0.9">
    <path d="M 610 300 C 590 240 570 200 545 170"/>
    <path d="M 640 292 C 635 230 630 185 630 150"/>
    <path d="M 672 300 C 692 245 705 205 710 175"/>
  </g>
  <!-- tail -->
  <path d="M 262 552 L 120 440 L 186 578 L 100 682 L 252 640 Z" fill="#2f6fd6"/>
  <!-- body -->
  <path d="M 248 590 C 246 420 430 296 640 330 C 812 356 892 462 878 586 C 866 690 752 744 594 738 C 424 732 252 700 248 590 Z" fill="url(#whale)"/>
  <!-- belly -->
  <path d="M 320 640 C 420 720 640 742 776 700 C 830 680 862 650 874 620 C 800 716 620 762 420 748 C 352 742 300 706 282 652 C 292 649 304 645 320 640 Z" fill="#cfe6ff" opacity="0.85"/>
  <!-- pleats -->
  <g stroke="#9cc4ef" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.75">
    <path d="M 330 662 C 430 706 560 718 690 702"/>
    <path d="M 336 692 C 440 734 560 746 676 730"/>
    <path d="M 348 722 C 440 758 545 768 648 754"/>
  </g>
  <!-- flipper -->
  <path d="M 470 660 C 520 700 600 716 656 700 C 600 736 500 730 470 660 Z" fill="#2f6fd6"/>
  <!-- eye -->
  <circle cx="742" cy="502" r="34" fill="#eaf4ff"/>
  <circle cx="754" cy="498" r="17" fill="#12305e"/>
  <circle cx="760" cy="492" r="6" fill="#ffffff"/>
  <!-- mouth -->
  <path d="M 792 556 C 820 566 842 572 862 570" stroke="#24579f" stroke-width="12" stroke-linecap="round" fill="none"/>
  <!-- waves -->
  <g stroke="#7fb4f0" stroke-width="14" stroke-linecap="round" fill="none" opacity="0.5">
    <path d="M 220 850 C 300 826 380 826 460 850"/>
    <path d="M 520 862 C 610 838 700 838 800 862"/>
  </g>
</svg>`

const traySvg = (dot) => `<svg width="32" height="32" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d1b3d"/>
      <stop offset="1" stop-color="#173f80"/>
    </linearGradient>
    <linearGradient id="whale" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#63a9f7"/>
      <stop offset="1" stop-color="#2f6fd6"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="190" fill="url(#bg)"/>
  <path d="M 262 552 L 120 440 L 186 578 L 100 682 L 252 640 Z" fill="#2f6fd6"/>
  <path d="M 248 590 C 246 420 430 296 640 330 C 812 356 892 462 878 586 C 866 690 752 744 594 738 C 424 732 252 700 248 590 Z" fill="url(#whale)"/>
  <path d="M 320 640 C 420 720 640 742 776 700 C 830 680 862 650 874 620 C 800 716 620 762 420 748 C 352 742 300 706 282 652 C 292 649 304 645 320 640 Z" fill="#cfe6ff" opacity="0.85"/>
  <circle cx="742" cy="502" r="34" fill="#eaf4ff"/>
  <circle cx="754" cy="498" r="17" fill="#12305e"/>
  ${dot ? '<circle cx="868" cy="868" r="120" fill="#2ea043" stroke="#0d1117" stroke-width="24"/>' : ''}
</svg>`

await sharp(Buffer.from(iconSvg)).resize(1024, 1024).png().toFile(resolve(buildDir, 'icon.png'))
await sharp(Buffer.from(traySvg(false))).resize(32, 32).png().toFile(resolve(buildDir, 'tray.png'))
await sharp(Buffer.from(traySvg(true))).resize(32, 32).png().toFile(resolve(buildDir, 'tray-running.png'))

console.log('icons written to app/build/ (icon.png, tray.png, tray-running.png)')
