import { createI18n } from "vue-i18n";
import { useLocalStorage } from "@vueuse/core";
import zhCN from "./locales/zh-CN/index.js";
import enUS from "./locales/en-US/index.js";
import { createLogger } from "@/utils/logger.js";

const log = createLogger("i18n");

// Get default language. In eco-drive mode we force zh-CN.
const getBrowserLanguage = () => {
  return "zh-CN";
};

// Use saved language preference when available.
const storedLanguage = useLocalStorage("language", getBrowserLanguage());
const getSavedLanguage = () => storedLanguage.value || getBrowserLanguage();

export const saveLanguagePreference = (lang) => {
  storedLanguage.value = lang;
};

const i18n = createI18n({
  legacy: false,
  locale: getSavedLanguage(),
  fallbackLocale: "zh-CN",
  messages: {
    "zh-CN": zhCN,
    "en-US": enUS,
  },
  globalInjection: true,
  warnHtmlMessage: false,
  silentTranslationWarn: true,
  silentFallbackWarn: true,
});

export const debugI18n = () => {
  if (import.meta.env.DEV) {
    log.debug("Current i18n config:", {
      locale: i18n.global.locale.value,
      fallbackLocale: i18n.global.fallbackLocale.value,
      availableLocales: Object.keys(i18n.global.messages.value),
      modular: "enabled",
    });
  }
};

export default i18n;