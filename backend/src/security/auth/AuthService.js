/**
 * 统一认证服务
 * 具体的认证逻辑、身份识别、权限检查
 */

import { Permission, PermissionChecker } from "../../constants/permissions.js";
import { validateAdminToken } from "../../services/adminService.js";
import { checkAndDeleteExpiredApiKey } from "../../services/apiKeyService.js";
import { verifyPassword } from "../../utils/crypto.js";
import { ensureRepositoryFactory } from "../../utils/repositories.js";

const jwtTextEncoder = new TextEncoder();
const jwtTextDecoder = new TextDecoder();

function base64UrlToUint8Array(input) {
  if (!input || typeof input !== "string") return null;
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  const padded = pad === 0 ? b64 : b64 + "=".repeat(4 - pad);
  let raw;
  try {
    raw = atob(padded);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function verifyJwtHs256(token, secret) {
  if (!token || typeof token !== "string") {
    throw new Error("Invalid token");
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token");
  }
  const [encodedHeader, encodedPayload, encodedSig] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signatureBytes = base64UrlToUint8Array(encodedSig);
  if (!signatureBytes) throw new Error("Invalid signature");

  const key = await crypto.subtle.importKey(
    "raw",
    jwtTextEncoder.encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const ok = await crypto.subtle.verify("HMAC", key, signatureBytes, jwtTextEncoder.encode(signingInput));
  if (!ok) throw new Error("Invalid signature");

  const payloadBytes = base64UrlToUint8Array(encodedPayload);
  if (!payloadBytes) throw new Error("Invalid payload");
  const payloadText = jwtTextDecoder.decode(payloadBytes);
  const payload = JSON.parse(payloadText);
  return payload;
}

/**
 * 认证结果类
 * 包含网关需要的核心属性和方法
 */
export class AuthResult {
  constructor({ isAuthenticated = false, userId = null, permissions = 0, basicPath = "/", isAdmin = false, keyInfo = null } = {}) {
    this.isAuthenticated = isAuthenticated;
    this.userId = userId;
    this.permissions = permissions;
    this.basicPath = basicPath;
    this._isAdmin = isAdmin;
    this.keyInfo = keyInfo;
  }

  /**
   * 检查是否有指定权限
   * 网关需要的核心方法
   */
  hasPermission(permissionFlag) {
    // 管理员拥有所有权限
    if (this._isAdmin) {
      return true;
    }
    return PermissionChecker.hasPermission(this.permissions, permissionFlag);
  }

  /**
   * 检查是否为管理员
   * 网关需要的核心方法
   */
  isAdmin() {
    return this._isAdmin;
  }

  /**
   * 获取用户ID
   * 网关工具函数需要的方法
   */
  getUserId() {
    return this.userId;
  }

  /**
   * 获取用户类型
   * WebDAV认证需要的方法
   */
  getUserType() {
    if (this._isAdmin) {
      return "admin";
    }
    if (this.keyInfo) {
      return "apiKey";
    }
    return "unknown";
  }

  /**
   * 检查是否有任一权限
   * 网关权限验证需要的方法
   */
  hasAnyPermission(permissionFlags) {
    // 管理员拥有所有权限
    if (this._isAdmin) {
      return true;
    }
    return PermissionChecker.hasAnyPermission(this.permissions, permissionFlags);
  }

  /**
   * 检查是否有所有权限
   * 网关权限验证需要的方法
   */
  hasAllPermissions(permissionFlags) {
    // 管理员拥有所有权限
    if (this._isAdmin) {
      return true;
    }
    return PermissionChecker.hasAllPermissions(this.permissions, permissionFlags);
  }
}

/**
 * 认证服务类 - 基于位标志权限系统
 */
export class AuthService {
  constructor(db, repositoryFactory = null, options = {}) {
    this.db = db;
    this.repositoryFactory = ensureRepositoryFactory(db, repositoryFactory);
    this.ecoSsoSecret = options?.ecoSsoSecret || null;
    this.allowLegacyAuth = Boolean(options?.allowLegacyAuth);
  }

  /**
   * 解析认证头
   */
  async validateEcoSsoAuth(token) {
    const secret = this.ecoSsoSecret;
    if (!secret || typeof secret !== "string") {
      return new AuthResult();
    }

    let payload;
    try {
      payload = await verifyJwtHs256(token, secret);
    } catch {
      return new AuthResult();
    }

    const now = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload !== "object") return new AuthResult();
    if (payload.iss !== "eco-guide") return new AuthResult();
    if (payload.aud !== "cloudpaste") return new AuthResult();
    if (typeof payload.exp !== "number" || payload.exp < now) return new AuthResult();

    const orgId = Number(payload.org_id);
    if (!Number.isFinite(orgId) || orgId <= 0) return new AuthResult();

    const role = String(payload.role || "viewer").toLowerCase();
    const sub = String(payload.sub || "");
    if (!sub) return new AuthResult();

    const basicPath = `/drive/org/${orgId}`;

    const canEdit = role === "owner" || role === "admin" || role === "member";
    const permissions = canEdit
      ? Permission.MOUNT_VIEW |
        Permission.MOUNT_UPLOAD |
        Permission.MOUNT_COPY |
        Permission.MOUNT_RENAME |
        Permission.MOUNT_DELETE |
        Permission.FILE_SHARE |
        Permission.FILE_MANAGE
      : Permission.MOUNT_VIEW;

    const principalId = `eco:${sub}`;

    return new AuthResult({
      isAuthenticated: true,
      userId: principalId,
      permissions,
      basicPath,
      isAdmin: false,
      keyInfo: {
        id: principalId,
        name: principalId,
        key: null,
        basicPath,
        permissions,
        role,
        isGuest: false,
        isEnabled: true,
        provider: "eco",
        ecoRole: role,
        ecoOrgId: orgId,
      },
    });
  }

  parseAuthHeader(authHeader) {
    if (!authHeader) {
      return { type: null, token: null };
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2) {
      return { type: null, token: null };
    }

    const [type, token] = parts;
    return {
      type: type.toLowerCase(),
      token: token,
    };
  }

  /**
   * 验证管理员认证
   */
  async validateAdminAuth(token) {
    const adminId = await validateAdminToken(this.db, token, this.repositoryFactory);
    if (!adminId) {
      return new AuthResult();
    }

    return new AuthResult({
      isAuthenticated: true,
      userId: adminId,
      permissions: 0,
      isAdmin: true,
    });
  }

  /**
   * 验证API密钥认证
   */
  async validateApiKeyAuth(apiKey) {
    const apiKeyRepository = this.repositoryFactory.getApiKeyRepository();
    const keyRecord = await apiKeyRepository.findByKey(apiKey);

    if (!keyRecord) {
      return new AuthResult();
    }

    if (await checkAndDeleteExpiredApiKey(this.db, keyRecord, this.repositoryFactory)) {
      return new AuthResult();
    }

    await apiKeyRepository.updateLastUsed(keyRecord.id);
    return this.buildApiKeyAuthResult(keyRecord);
  }

  /**
   * 验证Basic认证（用于WebDAV）
   */
  async validateBasicAuth(token) {
    const credentials = this.decodeBasicCredentials(token);
    if (!credentials) {
      return new AuthResult();
    }

    const separatorIndex = credentials.indexOf(":");
    if (separatorIndex === -1) {
      return new AuthResult();
    }

    const username = credentials.slice(0, separatorIndex);
    const password = credentials.slice(separatorIndex + 1);
    if (!username || !password) {
      return new AuthResult();
    }

    const adminResult = await this.authenticateBasicAdmin(username, password);
    if (adminResult) {
      return adminResult;
    }

    const apiKeyResult = await this.authenticateBasicApiKey(username, password);
    if (apiKeyResult) {
      return apiKeyResult;
    }

    return new AuthResult();
  }

  decodeBasicCredentials(token) {
    if (!token || typeof token !== "string") {
      return null;
    }

    const normalized = token.trim();
    if (!normalized) {
      return null;
    }

    const decoded = Buffer.from(normalized, "base64").toString("utf-8");
    return decoded || null;
  }

  async authenticateBasicAdmin(username, password) {
    const adminRepository = this.repositoryFactory.getAdminRepository();
    const adminRecord = await adminRepository.findByUsername(username);

    if (adminRecord && (await verifyPassword(password, adminRecord.password))) {
      return new AuthResult({
        isAuthenticated: true,
        userId: adminRecord.id,
        permissions: 0,
        isAdmin: true,
      });
    }

    return null;
  }

  async authenticateBasicApiKey(username, password) {
    if (username !== password) {
      return null;
    }

    const apiKeyRepository = this.repositoryFactory.getApiKeyRepository();
    const keyRecord = await apiKeyRepository.findByKey(username);
    if (!keyRecord) {
      return null;
    }

    const hasWebDAVPermission = PermissionChecker.hasPermission(keyRecord.permissions || 0, Permission.WEBDAV_READ);
    if (!hasWebDAVPermission) {
      return null;
    }

    if (await checkAndDeleteExpiredApiKey(this.db, keyRecord, this.repositoryFactory)) {
      return null;
    }

    await apiKeyRepository.updateLastUsed(keyRecord.id);
    return this.buildApiKeyAuthResult(keyRecord);
  }

  buildApiKeyAuthResult(keyRecord) {
    const isEnabled = typeof keyRecord.is_enable === "number" ? keyRecord.is_enable === 1 : Boolean(keyRecord.is_enable);
    if (!isEnabled) {
      return new AuthResult();
    }

    return new AuthResult({
      isAuthenticated: true,
      userId: keyRecord.id,
      permissions: keyRecord.permissions || 0,
      basicPath: keyRecord.basic_path || "/",
      keyInfo: {
        id: keyRecord.id,
        name: keyRecord.name,
        key: keyRecord.key,
        basicPath: keyRecord.basic_path || "/",
        permissions: keyRecord.permissions || 0,
        role: keyRecord.role || "GENERAL",
        isGuest: (keyRecord.role || "GENERAL") === "GUEST",
        isEnabled,
      },
    });
  }


  /**
   * 统一认证方法
   * 网关需要的核心方法
   */
  async authenticate(authHeader) {
    const { type, token } = this.parseAuthHeader(authHeader);

    if (!type || !token) {
      return new AuthResult();
    }

    if ((type === "bearer" || type === "apikey" || type === "basic") && !this.allowLegacyAuth) {
      return new AuthResult();
    }

    let result;
    switch (type) {
      case "bearer":
        result = await this.validateAdminAuth(token);
        break;
      case "apikey":
        result = await this.validateApiKeyAuth(token);
        break;
      case "ecosso":
        result = await this.validateEcoSsoAuth(token);
        break;
      case "basic":
        result = await this.validateBasicAuth(token);
        break;
      default:
        result = new AuthResult();
    }

    return result;
  }

  /**
   * 检查路径权限
   * 网关需要的核心方法
   */
  checkPathPermission(authResult, requestPath) {
    if (!authResult.isAuthenticated) {
      return false;
    }

    // 管理员有所有路径权限
    if (authResult.isAdmin()) {
      return true;
    }

    // API密钥检查基础路径权限
    const basicPath = authResult.basicPath || "/";
    return this.checkBasicPathPermission(basicPath, requestPath);
  }

  /**
   * 检查基础路径权限
   */
  checkBasicPathPermission(basicPath, requestPath) {
    if (!basicPath || !requestPath) {
      return false;
    }

    // 标准化路径
    const normalizeBasicPath = basicPath === "/" ? "/" : basicPath.replace(/\/+$/, "");
    const normalizeRequestPath = requestPath.replace(/\/+$/, "") || "/";

    // 如果基本路径是根路径，允许所有访问
    if (normalizeBasicPath === "/") {
      return true;
    }

    // 检查请求路径是否在基本路径范围内
    return normalizeRequestPath === normalizeBasicPath || normalizeRequestPath.startsWith(normalizeBasicPath + "/");
  }
}

/**
 * 创建认证服务实例
 */
export function createAuthService(db, repositoryFactory = null, options = {}) {
  return new AuthService(db, repositoryFactory, options);
}
