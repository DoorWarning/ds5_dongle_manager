import { Gamepad2, Info, Monitor } from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import {
  APP_METADATA,
  SETTINGS_SIDEBAR_PROVIDER_STYLE,
  type AppView,
} from "@/appConfig";
import { ConfigPanel } from "@/components/ConfigPanel";
import { NsPanel } from "@/components/NsPanel";
import { SidebarDeviceCard } from "@/components/SidebarDeviceCard";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { FirmwareUpdateCheckResult } from "@/lib/firmwareRelease";
import type { UseDs5BridgeResult } from "@/hooks/useDs5Bridge";

const NAV_ITEMS = [
  { icon: Monitor, labelKey: "settings.nav.pc", view: "pcSettings" },
  { icon: Gamepad2, labelKey: "settings.nav.ns", view: "nsSettings" },
  { icon: Info, labelKey: "settings.nav.about", view: "about" },
] as const satisfies ReadonlyArray<{
  icon: typeof Monitor;
  labelKey: string;
  view: Exclude<AppView, "home">;
}>;

interface SettingsViewProps {
  bridge: UseDs5BridgeResult;
  firmwareUpdateResult: FirmwareUpdateCheckResult | null;
  sidebarOpen: boolean;
  view: AppView;
  onFirmwareUpdateClick: () => void;
  onProgressComplete: () => void;
  onSidebarOpenChange: (open: boolean) => void;
  onViewChange: (view: AppView) => void;
}

export function SettingsView({
  bridge,
  firmwareUpdateResult,
  sidebarOpen,
  view,
  onFirmwareUpdateClick,
  onProgressComplete,
  onSidebarOpenChange,
  onViewChange,
}: SettingsViewProps) {
  const { t } = useTranslation();
  const navItems = NAV_ITEMS;

  return (
    <SidebarProvider className="settings-page" style={SETTINGS_SIDEBAR_PROVIDER_STYLE} open={sidebarOpen} onOpenChange={onSidebarOpenChange}>
      <Sidebar className="settings-sidebar" collapsible="icon" aria-label={t("settings.navigation")}>
        <SidebarContent className="settings-sidebar-content">
          <SidebarDeviceCard
            connectedDevice={bridge.client?.device ?? null}
            dongleMode={bridge.dongleMode}
            ds5Connected={bridge.ds5Connected}
            batteryText={bridge.batteryText}
            firmwareVersion={bridge.firmwareVersion}
            signalStrength={bridge.signalStrength}
            firmwareUpdateAvailable={Boolean(firmwareUpdateResult?.updateAvailable)}
            firmwareUpdateVersion={firmwareUpdateResult?.latestRelease.tagName}
            onFirmwareUpdateClick={onFirmwareUpdateClick}
          />
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const label = t(item.labelKey);

                  return (
                    <SidebarMenuItem key={item.labelKey}>
                      <SidebarMenuButton type="button" isActive={view === item.view} tooltip={label} onClick={() => onViewChange(item.view)}>
                        <item.icon />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarTrigger className="settings-sidebar-trigger" />
      </Sidebar>

      <SidebarInset className="settings-detail">
        <div key={view} className="settings-view-transition">
          {view === "pcSettings" ? (
            <ConfigPanel bridge={bridge} onProgressComplete={onProgressComplete} />
          ) : view === "nsSettings" ? (
            <NsPanel bridge={bridge} onProgressComplete={onProgressComplete} />
          ) : (
            <section className="panel about-panel" aria-labelledby="about-title">
              <div className="panel-title about-panel-title">
                <Info size={18} />
                <h2 id="about-title">{t("about.title")}</h2>
              </div>

              <div className="about-info-grid">
                {APP_METADATA.githubUrl ? (
                  <a className="config-section about-github-card" href={APP_METADATA.githubUrl} target="_blank" rel="noreferrer">
                    <FaGithub aria-hidden="true" />
                    <span>
                      <span className="about-info-label">{t("about.softwareGithub")}</span>
                      <strong>{APP_METADATA.githubUrl}</strong>
                    </span>
                  </a>
                ) : (
                  <div className="config-section about-github-card">
                    <FaGithub aria-hidden="true" />
                    <span>
                      <span className="about-info-label">{t("about.softwareGithub")}</span>
                      <strong>{APP_METADATA.githubRepo}</strong>
                    </span>
                  </div>
                )}
                <a className="config-section about-github-card" href={APP_METADATA.firmwareGithubUrl} target="_blank" rel="noreferrer">
                  <FaGithub aria-hidden="true" />
                  <span>
                    <span className="about-info-label">{t("about.firmwareGithub")}</span>
                    <strong>{APP_METADATA.firmwareGithubUrl}</strong>
                  </span>
                </a>
              </div>
            </section>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
