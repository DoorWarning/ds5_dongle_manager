# DS5 Dongle Manager

[한국어](README.ko.md) · [简体中文](README.zh-CN.md)

Windows desktop manager for the **DS5Dongle Switch fork**, [DoorWarning/DS5Dongle_switch2](https://github.com/DoorWarning/DS5Dongle_switch2). The fork is a Pico 2 W receiver that connects a DualSense to a PC (as a DualSense) or to a Switch 2 (as a wired Pro Controller).

The app is a Tauri + React application, forked from [AizawaHikaru233/DS5-NS2Pro-Dongle-Manager](https://github.com/AizawaHikaru233/DS5-NS2Pro-Dongle-Manager). The NS2Pro parts were removed and replaced with this firmware's features.

## Features

- **Finds the dongle in both modes.** In PC mode it appears as a DualSense (`054C:0CE6` / `0DF2`); in NS mode it appears as a Pro Controller (`057E:2009`).
- **Switches between PC and NS mode** with a click, without the controller combo. The dongle saves the mode and reboots, and the app reconnects.
- **PC mode settings:**
  - controller type (DS5 / DSE / Auto) and USB serial number;
  - polling rate;
  - haptics strength, adaptive trigger reduction and haptics buffer;
  - speaker and microphone routing, speaker gain and volume lock;
  - waking the PC with PS, and opening Xbox Game Bar with PS;
  - idle disconnect and the Pico LED;
  - status GPIO.
- **NS mode settings**, saved on the dongle as you edit:
  - vibration strength in 1 % steps;
  - 4 trigger modes, each with its own L2/R2 adaptive trigger effect (preset, typed parameters or the raw 11 bytes) and the point where ZL/ZR fire;
  - saved trigger patterns;
  - turbo buttons (○✕△□, L1/R1/L2/R2) and turbo speed;
  - a macro editor for the 4 slots. Each step has a time, buttons and both sticks; steps can be added, inserted, duplicated, moved and deleted.
- **Switch 2 wake beacon:** shows whether it is learned, and starts learning or forgets it.
- Shows the DualSense battery and signal, with low-battery and connection notifications, a tray icon and autostart.
- Checks GitHub for new versions of the app and the firmware.

The controller shortcuts (Mute + D-pad, Mute + double tap and so on) change the same NS settings, and the app follows those changes.

## Requirements

- Firmware **`switch-v3` or later** from [DS5Dongle_switch2 releases](https://github.com/DoorWarning/DS5Dongle_switch2/releases).
  - Older firmware still shows status and PC settings, but cannot switch modes or edit NS settings.
- NS settings and macros can only be edited while the dongle is **in NS mode and plugged into the PC**. Switch modes from the app, edit, then move the dongle back to the dock.
- Windows 10/11 with the WebView2 Runtime.

## Install

1. Download the latest `.msi` from [Releases](https://github.com/DoorWarning/ds5_dongle_manager/releases).
2. Install it.
3. Plug in the dongle and open **DS5 Dongle Manager**.

## Build

Requirements: Node.js 24, pnpm, the Rust stable MSVC toolchain, and Visual Studio C++ build tools.

```powershell
pnpm install
pnpm tauri dev     # run in development mode
pnpm build:msi     # MSI in src-tauri/target/release/bundle/msi/
```

Pushing a tag `v*` (for example `v1.0.0`) runs the `Release manager` workflow, which builds the MSI and attaches it to a GitHub release.

## How it talks to the dongle

- **PC mode:** the original web config Feature reports `0xF6`–`0xF9` for the PC settings, and the vendor Feature report `0xFA` for the companion protocol.
- **NS mode:** Pro Controller output report `0x01` with subcommand `0xE0`. The reply comes back in the `0x21` subcommand reply.
- Companion requests are `[cmd, seq, len, payload]` and replies are `[cmd, seq, status, len, data]`; see `src/companion.cpp` in the firmware.

## Credits

- Manager base: [GooGuJiang/ds5dongle-manager](https://github.com/GooGuJiang/ds5dongle-manager) and [AizawaHikaru233/DS5-NS2Pro-Dongle-Manager](https://github.com/AizawaHikaru233/DS5-NS2Pro-Dongle-Manager) (MIT)
- Firmware: [awalol/DS5Dongle](https://github.com/awalol/DS5Dongle); Switch Pro mode from [Demogorgon314/DS5Dongle](https://github.com/Demogorgon314/DS5Dongle)

## License

MIT. The upstream copyright notices are kept in [LICENSE](LICENSE).

Unofficial project, not affiliated with Nintendo or Sony.
