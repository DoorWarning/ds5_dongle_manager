import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const resolved = i18n.resolvedLanguage ?? "en";
  const currentLanguage = resolved.startsWith("zh") ? "zh" : resolved.startsWith("ko") ? "ko" : "en";

  return (
    <div className="language-switcher" aria-label={t("language.label")}>
      <Languages size={16} />
      <Tabs value={currentLanguage} onValueChange={(language) => void i18n.changeLanguage(language)}>
        <TabsList className="grid h-9 w-[180px] grid-cols-3">
          <TabsTrigger value="en" className="h-7 text-xs font-bold">
            EN
          </TabsTrigger>
          <TabsTrigger value="ko" className="h-7 text-xs font-bold">
            한국어
          </TabsTrigger>
          <TabsTrigger value="zh" className="h-7 text-xs font-bold">
            中文
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
