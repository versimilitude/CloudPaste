import { createI18n } from "vue-i18n";
import { useLocalStorage } from "@vueuse/core";
import zhCN from "./locales/zh-CN/index.js";
import enUS from "./locales/en-US/index.js";
import { createLogger } from "@/utils/logger.js";

const log = createLogger("i18n");

// 获取浏览器语言设置
const getBrowserLanguage = () => {
  return "zh-CN";
};

// 获取保存的语言设置，如果没有则使用浏览器语言
const storedLanguage = useLocalStorage("language", getBrowserLanguage());
const getSavedLanguage = () => storedLanguage.value || getBrowserLanguage();

// 保存语言设置到本地存�?
export const saveLanguagePreference = (lang) => {
  storedLanguage.value = lang;
};

// 创建i18n实例
const i18n = createI18n({
  legacy: false, // 使用组合式API
  locale: getSavedLanguage(),
  fallbackLocale: "zh-CN", // 回退语言
  messages: {
    "zh-CN": zhCN,
    "en-US": enUS,
  },
  // 确保正确处理日期和数字等格式�?
  globalInjection: true,
  // 使用HTML
  warnHtmlMessage: false,
  // 确保语言改变时静默警�?
  silentTranslationWarn: true,
  silentFallbackWarn: true,
});

// 调试辅助函数 - 仅在开发环境需要时使用
export const debugI18n = () => {
  if (import.meta.env.DEV) {
    log.debug("当前i18n配置:", {
      当前语言: i18n.global.locale.value,
      回退语言: i18n.global.fallbackLocale.value,
      可用语言: Object.keys(i18n.global.messages.value),
      模块化结�? "已启�?,
    });
  }
};

export default i18n;
