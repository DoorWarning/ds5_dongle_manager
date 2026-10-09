# DS5 Dongle Manager

[English](README.md) · [한국어](README.ko.md)

**DS5Dongle Switch 分支**（[DoorWarning/DS5Dongle_switch2](https://github.com/DoorWarning/DS5Dongle_switch2)）的 Windows 管理程序。该分支是一个 Pico 2 W 接收器，可把 DualSense 连接到 PC（作为 DualSense）或 Switch 2（作为有线 Pro 手柄）。

本程序基于 Tauri + React，fork 自 [AizawaHikaru233/DS5-NS2Pro-Dongle-Manager](https://github.com/AizawaHikaru233/DS5-NS2Pro-Dongle-Manager)，去掉了 NS2Pro 相关功能，换成了这个固件的功能。

## 功能

- **两种模式下都能识别接收器。** PC 模式显示为 DualSense（`054C:0CE6` / `0DF2`），NS 模式显示为 Pro 手柄（`057E:2009`）。
- **一键切换 PC / NS 模式**，无需手柄组合键。接收器保存模式并重启后，程序会重新连接。
- **PC 模式设置：**
  - 手柄类型（DS5 / DSE / 自动）和 USB 序列号；
  - 回报率；
  - 振动强度、自适应扳机减弱和振动缓冲；
  - 扬声器与麦克风路由、扬声器增益、锁定音量；
  - PS 键唤醒电脑、PS 键打开 Xbox Game Bar；
  - 无操作断开和 Pico 指示灯；
  - 状态 GPIO。
- **NS 模式设置**（编辑时自动保存到接收器）：
  - 振动强度，1% 步进；
  - 4 种扳机模式，每种分别设置 L2/R2 自适应扳机效果（预设、参数或原始 11 字节）和 ZL/ZR 触发点；
  - 保存扳机样式；
  - 连发按键（○✕△□、L1/R1/L2/R2）和连发速度；
  - 4 个槽位的宏编辑器：每一步设置时间、按键和左右摇杆，可添加、插入、复制、移动、删除步骤。
- **Switch 2 唤醒信标：** 显示是否已学习，可开始学习或清除。
- 显示 DualSense 电量和信号，提供低电量与连接通知、托盘图标和开机自启。
- 从 GitHub 检查程序和固件的新版本。

手柄快捷键（静音 + 方向键、静音 + 双击等）修改的是同一套 NS 设置，程序会同步显示这些变化。

## 要求

- 固件 **`switch-v3` 或更新**（[DS5Dongle_switch2 发布页](https://github.com/DoorWarning/DS5Dongle_switch2/releases)）。
  - 旧固件只能显示状态和修改 PC 设置，不能切换模式或编辑 NS 设置。
- NS 设置和宏只能在接收器**处于 NS 模式并插在电脑上**时编辑。在程序中切换到 NS 模式，编辑完成后再把接收器插回底座。
- Windows 10/11，WebView2 运行时。

## 安装

1. 从[发布页](https://github.com/DoorWarning/ds5_dongle_manager/releases)下载最新的 `.msi`。
2. 安装。
3. 插入接收器，打开 **DS5 Dongle Manager**。

## 构建

需要：Node.js 24、pnpm、Rust stable（MSVC）、Visual Studio C++ 构建工具。

```powershell
pnpm install
pnpm tauri dev     # 开发模式运行
pnpm build:msi     # MSI 位于 src-tauri/target/release/bundle/msi/
```

推送 `v*` 标签（例如 `v1.0.0`）会运行 `Release manager` 工作流，构建 MSI 并上传到 GitHub 发布页。

## 致谢

- 管理程序基础：[GooGuJiang/ds5dongle-manager](https://github.com/GooGuJiang/ds5dongle-manager)、[AizawaHikaru233/DS5-NS2Pro-Dongle-Manager](https://github.com/AizawaHikaru233/DS5-NS2Pro-Dongle-Manager)（MIT）
- 固件：[awalol/DS5Dongle](https://github.com/awalol/DS5Dongle)；Switch Pro 模式来自 [Demogorgon314/DS5Dongle](https://github.com/Demogorgon314/DS5Dongle)

## 许可证

MIT。上游版权声明保留在 [LICENSE](LICENSE) 中。

非官方项目，与 Nintendo、Sony 无关。
