/**
 * API缁熶竴閰嶇疆鏂囦欢
 * 绠＄悊API璇锋眰鐨勫熀纭€URL鍜屽叾浠栭厤缃?
 * 鏀寔鏈湴寮€鍙戙€佺敓浜у拰Docker閮ㄧ讲鐜
 */

import { useLocalStorage } from "@vueuse/core";
import { createLogger } from "@/utils/logger.js";

// 榛樿鐨勫紑鍙戠幆澧傾PI鍩虹URL
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

// 妫€鏌ユ槸鍚﹀湪Docker鐜涓繍琛?
const isDockerEnvironment = () => {
  return import.meta.env.VITE_IS_DOCKER === "true";
};

// 浼樺厛浠庡叏灞€閰嶇疆璇诲彇锛岀劧鍚庢牴鎹幆澧冮€夋嫨涓嶅悓鐨勫洖閫€绛栫暐
function getApiBaseUrl() {
  const driveBase = getDriveBasePath();
  // 棣栧厛妫€鏌ヨ繍琛屾椂閰嶇疆 (window.appConfig) - 鎵€鏈夌幆澧冮€氱敤
  if (typeof window !== "undefined" && window.appConfig && window.appConfig.backendUrl) {
    const runtimeUrl = window.appConfig.backendUrl;
    // 缁熶竴浣跨敤__BACKEND_URL__浣滀负鍗犱綅绗︼紝閬垮厤涓嶅悓鐜澶勭悊閫昏緫涓嶄竴鑷?
    if (runtimeUrl !== "__" + "BACKEND_URL__") {
      log.debug("PROD same-origin backend", window.location.origin, driveBase);
      return runtimeUrl;
    }
  }

  // 闈濪ocker鐜涓嬫墠妫€鏌ocalStorage
  if (!isDockerEnvironment() && typeof window !== "undefined" && window.localStorage) {
    const storedUrl = useLocalStorage("vite-api-base-url", "").value;
    if (storedUrl) {
      log.debug("PROD same-origin backend", window.location.origin, driveBase);
      return storedUrl;
    }
  }

  // 鎵€鏈夌幆澧冮兘妫€鏌ョ幆澧冨彉閲?
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl) {
    return envUrl;
  }

  // 鐢熶骇鐜锛氬崟 Worker 閮ㄧ讲鏃朵娇鐢ㄥ悓婧愶紙Cloudflare Workers SPA 妯″紡锛?
  if (import.meta.env.PROD && typeof window !== "undefined") {
    log.debug("PROD same-origin backend", window.location.origin, driveBase);
    return `${window.location.origin}${driveBase}`;
  }

  // 鏈€鍚庝娇鐢ㄩ粯璁ゅ€?
  return DEFAULT_DEV_API_URL;
}

// 鑾峰彇API鍩虹URL
export const API_BASE_URL = getApiBaseUrl();

// API鐗堟湰鍓嶇紑锛屼笌鍚庣淇濇寔涓€鑷?
export const API_PREFIX = "/api";

// 瀹屾暣鐨凙PI鍩虹URL锛堝寘鍚墠缂€锛?
export const getFullApiUrl = (endpoint) => {
  // 濡傛灉endpoint宸茬粡鍖呭惈浜嗗畬鏁碪RL锛屽垯鐩存帴杩斿洖
  if (endpoint.startsWith("http")) {
    return endpoint;
  }

  // 确保endpoint以/开头
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  // 濡傛灉璋冪敤鏂瑰凡缁忓甫浜?/api 鍓嶇紑锛堝巻鍙蹭唬鐮侊級锛岄伩鍏嶉噸澶嶆嫾鎺ユ垚 /api/api/...
  if (normalizedEndpoint === API_PREFIX || normalizedEndpoint.startsWith(`${API_PREFIX}/`)) {
    return `${API_BASE_URL}${normalizedEndpoint}`;
  }

  // 娣诲姞API鍓嶇紑
  return `${API_BASE_URL}${API_PREFIX}${normalizedEndpoint}`;
};

// 瀵煎嚭鐜淇℃伅鏂规硶锛屼究浜庤皟璇?
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
