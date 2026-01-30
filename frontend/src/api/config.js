/**
 * API统一配置文件
 * 管理API请求的基础URL和其他配�?
 * 支持本地开发、生产和Docker部署环境
 */

import { useLocalStorage } from "@vueuse/core";
import { createLogger } from "@/utils/logger.js";

// 默认的开发环境API基础URL
const DEFAULT_DEV_API_URL = "http://localhost:8787";
const log = createLogger("ApiConfig");

const getDriveBasePath = () => {
  try {
    if (typeof window === "undefined") return "";
    return window.location.pathname.startsWith("/drive") ? "/drive" : "";
  } catch {
    return "";
  }
};

// 检查是否在Docker环境中运�?
const isDockerEnvironment = () => {
  return import.meta.env.VITE_IS_DOCKER === "true";
};

// 优先从全局配置读取，然后根据环境选择不同的回退策略
function getApiBaseUrl() {
  const driveBase = getDriveBasePath();
  // 首先检查运行时配置 (window.appConfig) - 所有环境通用
  if (typeof window !== "undefined" && window.appConfig && window.appConfig.backendUrl) {
    const runtimeUrl = window.appConfig.backendUrl;
    // 统一使用__BACKEND_URL__作为占位符，避免不同环境处理逻辑不一�?
    if (runtimeUrl !== "__" + "BACKEND_URL__") {
      log.debug("PROD same-origin backend", window.location.origin, driveBase);
      return runtimeUrl;
    }
  }

  // 非Docker环境下才检查localStorage
  if (!isDockerEnvironment() && typeof window !== "undefined" && window.localStorage) {
    const storedUrl = useLocalStorage("vite-api-base-url", "").value;
    if (storedUrl) {
      log.debug("PROD same-origin backend", window.location.origin, driveBase);
      return storedUrl;
    }
  }

  // 所有环境都检查环境变�?
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl) {
    return envUrl;
  }

  // 生产环境：单 Worker 部署时使用同源（Cloudflare Workers SPA 模式�?
  if (import.meta.env.PROD && typeof window !== "undefined") {
    log.debug("PROD same-origin backend", window.location.origin, driveBase);
    return `${window.location.origin}${driveBase}`;
  }

  // 最后使用默认�?
  return DEFAULT_DEV_API_URL;
}

// 获取API基础URL
export const API_BASE_URL = getApiBaseUrl();

// API版本前缀，与后端保持一�?
export const API_PREFIX = "/api";

// 完整的API基础URL（包含前缀�?
export const getFullApiUrl = (endpoint) => {
  // 如果endpoint已经包含了完整URL，则直接返回
  if (endpoint.startsWith("http")) {
    return endpoint;
  }

  // 确保endpoint�?开�?  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  // 如果调用方已经带�?/api 前缀（历史代码），避免重复拼接成 /api/api/...
  if (normalizedEndpoint === API_PREFIX || normalizedEndpoint.startsWith(`${API_PREFIX}/`)) {
    return `${API_BASE_URL}${normalizedEndpoint}`;
  }

  // 添加API前缀
  return `${API_BASE_URL}${API_PREFIX}${normalizedEndpoint}`;
};

// 导出环境信息方法，便于调�?
export const getEnvironmentInfo = () => {
  return {
    apiBaseUrl: API_BASE_URL,
    apiPrefix: API_PREFIX,
    mode: import.meta.env.MODE,
    isDevelopment: import.meta.env.DEV,
    isProduction: import.meta.env.PROD,
    backendUrl: window?.appConfig?.backendUrl || import.meta.env.VITE_BACKEND_URL,
    isDockerBuild: isDockerEnvironment(),
  };
};
