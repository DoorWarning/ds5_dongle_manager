# DS5 Dongle Manager

[English](README.md) · [简体中文](README.zh-CN.md)

**DS5Dongle 스위치 포크**([DoorWarning/DS5Dongle_switch2](https://github.com/DoorWarning/DS5Dongle_switch2))용 Windows 관리 프로그램입니다. 이 포크는 DualSense를 PC(DualSense로)나 스위치 2(유선 프로콘으로)에 연결해 주는 Pico 2 W 수신기입니다.

Tauri + React 앱이며, [AizawaHikaru233/DS5-NS2Pro-Dongle-Manager](https://github.com/AizawaHikaru233/DS5-NS2Pro-Dongle-Manager)를 포크해서 NS2Pro 관련 기능을 빼고 이 펌웨어의 기능으로 바꿨습니다.

## 기능

- **두 모드 모두에서 동글을 찾습니다.** PC 모드에서는 DualSense(`054C:0CE6` / `0DF2`), NS 모드에서는 프로콘(`057E:2009`)으로 보입니다.
- **PC ↔ NS 모드 전환**을 컨트롤러 조합 없이 클릭 한 번으로 합니다. 동글이 모드를 저장하고 재부팅하면 앱이 다시 연결합니다.
- **PC 모드 설정**
  - 컨트롤러 종류(DS5/DSE/자동)와 USB 시리얼
  - 보고 주기
  - 햅틱 세기, 적응형 트리거 약화, 햅틱 버퍼
  - 스피커·마이크 경로, 스피커 증폭, 음량 고정
  - PS로 PC 깨우기, PS로 Xbox Game Bar 열기
  - 미입력 연결 끊기, Pico LED
  - 상태 GPIO
- **NS 모드 설정** (편집하는 대로 동글에 저장)
  - 진동 세기 (1% 단위)
  - 트리거 모드 4개: 모드마다 L2/R2 적응형 트리거 효과(기본 패턴, 수치 편집, 원시 11바이트)와 ZL/ZR 입력 지점을 따로 정함
  - 트리거 패턴 저장
  - 연사 버튼(○✕△□, L1/R1/L2/R2)과 연사 속도
  - 매크로 편집기: 슬롯 4개, 단계마다 시간·버튼·양쪽 스틱. 단계 추가·삽입·복제·이동·삭제
- **스위치 2 깨우기 비컨:** 학습 여부 표시, 학습 시작, 지우기
- DualSense 배터리와 신호 표시, 배터리 부족·연결 알림, 트레이, 자동 실행
- 앱과 펌웨어 새 버전 확인 (GitHub)

컨트롤러 단축키(음소거 + 방향키, 음소거 + 더블탭 등)도 같은 NS 설정을 바꾸고, 앱이 그 변경을 따라갑니다.

## 필요한 것

- 펌웨어 **`switch-v3` 이상** ([DS5Dongle_switch2 릴리스](https://github.com/DoorWarning/DS5Dongle_switch2/releases))
  - 이전 펌웨어에서는 상태 표시와 PC 설정만 됩니다. 모드 전환과 NS 설정 편집은 안 됩니다.
- NS 설정과 매크로는 동글이 **NS 모드로 PC에 꽂혀 있을 때만** 편집할 수 있습니다. 앱에서 NS 모드로 전환해 편집한 뒤 동글을 독으로 옮기면 됩니다.
- Windows 10/11, WebView2 런타임

## 설치

1. [릴리스](https://github.com/DoorWarning/ds5_dongle_manager/releases)에서 최신 `.msi`를 받습니다.
2. 설치합니다.
3. 동글을 꽂고 **DS5 Dongle Manager**를 엽니다.

## 빌드

필요한 것: Node.js 24, pnpm, Rust stable(MSVC), Visual Studio C++ 빌드 도구

```powershell
pnpm install
pnpm tauri dev     # 개발 모드로 실행
pnpm build:msi     # MSI: src-tauri/target/release/bundle/msi/
```

`v*` 태그(예: `v1.0.0`)를 push하면 `Release manager` 워크플로가 MSI를 빌드해 GitHub 릴리스에 올립니다.

## 동글과 통신하는 방식

- **PC 모드:** PC 설정은 원래 웹 설정의 Feature 보고서 `0xF6`~`0xF9`를 쓰고, 동반 프로토콜은 전용 Feature 보고서 `0xFA`를 씁니다.
- **NS 모드:** 프로콘 출력 보고서 `0x01`의 서브커맨드 `0xE0`으로 보내고, `0x21` 서브커맨드 응답으로 받습니다.
- 요청은 `[cmd, seq, len, payload]`, 응답은 `[cmd, seq, status, len, data]`입니다. 펌웨어의 `src/companion.cpp`를 참고하세요.

## 출처

- 매니저 기반: [GooGuJiang/ds5dongle-manager](https://github.com/GooGuJiang/ds5dongle-manager), [AizawaHikaru233/DS5-NS2Pro-Dongle-Manager](https://github.com/AizawaHikaru233/DS5-NS2Pro-Dongle-Manager) (MIT)
- 펌웨어: [awalol/DS5Dongle](https://github.com/awalol/DS5Dongle), 스위치 프로 모드는 [Demogorgon314/DS5Dongle](https://github.com/Demogorgon314/DS5Dongle)

## 라이선스

MIT. 원본 저작권 표시는 [LICENSE](LICENSE)에 남겨 두었습니다.

비공식 프로젝트이며 Nintendo, Sony와 관계없습니다.
