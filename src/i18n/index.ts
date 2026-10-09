import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { resources } from "./locales";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: ["en", "ko", "zh"],
    load: "languageOnly",
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

function htmlLanguage(language: string | undefined): string {
  if (language?.startsWith("zh")) {
    return "zh-CN";
  }
  return language?.startsWith("ko") ? "ko" : "en";
}

i18n.on("languageChanged", (language) => {
  const normalizedLanguage = htmlLanguage(language);

  document.documentElement.lang = normalizedLanguage;
  document.documentElement.translate = false;
});

void i18n.loadNamespaces([]).then(() => {
  const normalizedLanguage = htmlLanguage(i18n.resolvedLanguage);

  document.documentElement.lang = normalizedLanguage;
  document.documentElement.translate = false;
});

export default i18n;
