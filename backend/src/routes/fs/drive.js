import { ValidationError, NotFoundError, AuthorizationError } from "../../http/errors.js";
import { jsonOk } from "../../utils/common.js";
import { MountManager } from "../../storage/managers/MountManager.js";
import { usePolicy } from "../../security/policies/policies.js";
import { VfsNodesRepository, VFS_ROOT_PARENT_ID } from "../../repositories/VfsNodesRepository.js";
import { DbTables } from "../../constants/index.js";
import { generateUUID } from "../../utils/common.js";
import { getEncryptionSecret } from "../../utils/environmentUtils.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TRASH_RETENTION_DAYS = 30;
const MAX_FILE_VERSIONS = 10;

const parseJsonBody = async (c, next) => {
  const body = await c.req.json();
  c.set("jsonBody", body);
  await next();
};

const listPathsResolver = (field) => (c) => {
  const body = c.get("jsonBody");
  const value = body?.[field];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const requireEcoUserInfo = (userIdOrInfo) => {
  if (!userIdOrInfo || typeof userIdOrInfo !== "object" || userIdOrInfo.provider !== "eco") {
    throw new AuthorizationError("Eco drive only");
  }
  const orgId = Number(userIdOrInfo.ecoOrgId);
  if (!Number.isFinite(orgId) || orgId <= 0) {
    throw new AuthorizationError("Invalid org");
  }
  return { orgId };
};

const resolveEcoScope = async ({ db, encryptionSecret, repositoryFactory, basePath, userIdOrInfo, userType, c }) => {
  const { orgId } = requireEcoUserInfo(userIdOrInfo);
  const mountManager = new MountManager(db, encryptionSecret, repositoryFactory, { env: c.env });
  // basePath 只用于解析挂载点；EcoDrive 实际目录受后端校验约束
  const pathForMountResolve = typeof basePath === "string" && basePath ? basePath : `/drive/org/${orgId}`;
  const mountResult = await mountManager.getDriverByPath(pathForMountResolve, userIdOrInfo, userType);
  const scopeType = "mount";
  const scopeId = String(mountResult?.mount?.id || "");
  if (!scopeId) throw new ValidationError("Invalid mount");
  const ownerType = "eco_org";
  const ownerId = `org:${orgId}`;
  const userId = String(userIdOrInfo?.id || "");
  return { orgId, ownerType, ownerId, scopeType, scopeId, userId };
};

const normalizeNameBase = (name) => {
  const raw = typeof name === "string" ? name.trim() : String(name ?? "").trim();
  return raw || "untitled";
};

const buildAutoRenamed = (name, suffix) => {
  const base = normalizeNameBase(name);
  const match = base.match(/^(.*?)(\.[^.]*)?$/);
  const stem = match?.[1] ?? base;
  const ext = match?.[2] ?? "";
  return `${stem} ${suffix}${ext}`;
};

const findAvailableName = async ({ repo, ownerType, ownerId, scopeType, scopeId, parentId, desiredName }) => {
  const base = normalizeNameBase(desiredName);
  const existing = await repo.getChildByName({ ownerType, ownerId, scopeType, scopeId, parentId, name: base });
  if (!existing) return base;

  // 还原冲突：按 Windows 类似策略递增
  for (let i = 1; i <= 999; i += 1) {
    const candidate = buildAutoRenamed(base, `(${i})`);
    const hit = await repo.getChildByName({ ownerType, ownerId, scopeType, scopeId, parentId, name: candidate });
    if (!hit) return candidate;
  }

  // 兜底：UUID
  return buildAutoRenamed(base, `(${generateUUID()})`);
};

const purgeBlobRefs = async ({ db, orgId, blobIds = [] }) => {
  if (!blobIds.length) return;
  // 扣减引用计数；当 ref_count <= 0 时标记 deleted_at（是否删除 R2 对象留给后续清理任务）
  for (const blobId of blobIds) {
    if (!blobId) continue;
    await db
      .prepare(
        `
        UPDATE ${DbTables.DRIVE_BLOBS}
        SET ref_count = CASE WHEN ref_count > 0 THEN ref_count - 1 ELSE 0 END,
            updated_at = CURRENT_TIMESTAMP,
            deleted_at = CASE WHEN ref_count <= 1 THEN CURRENT_TIMESTAMP ELSE deleted_at END
        WHERE id = ? AND org_id = ?
        `,
      )
      .bind(String(blobId), orgId)
      .run();
  }
};

const collectBlobRefsForNodeSubtree = async ({ db, rootNodeId }) => {
  // 收集子树所有 file 节点的 content_ref=blob:<id>，以及版本表引用的 blob_id
  const fileRows = await db
    .prepare(
      `
      WITH RECURSIVE subtree(id) AS (
        SELECT ?
        UNION ALL
        SELECT n.id
        FROM ${DbTables.VFS_NODES} n
        JOIN subtree s ON n.parent_id = s.id
      )
      SELECT n.id AS node_id, n.node_type, n.content_ref
      FROM ${DbTables.VFS_NODES} n
      JOIN subtree s ON n.id = s.id
      WHERE n.node_type = 'file'
      `,
    )
    .bind(String(rootNodeId))
    .all();

  const nodeBlobIds = [];
  const fileNodeIds = [];
  for (const r of fileRows?.results || []) {
    const ref = typeof r.content_ref === "string" ? r.content_ref : "";
    if (ref.startsWith("blob:")) {
      nodeBlobIds.push(ref.slice("blob:".length));
    }
    fileNodeIds.push(String(r.node_id));
  }

  const versionBlobIds = [];
  if (fileNodeIds.length) {
    // 逐批查询（避免 IN 过长）
    const batchSize = 100;
    for (let i = 0; i < fileNodeIds.length; i += batchSize) {
      const batch = fileNodeIds.slice(i, i + batchSize);
      const placeholders = batch.map(() => "?").join(",");
      const versionRows = await db
        .prepare(
          `
          SELECT blob_id
          FROM ${DbTables.DRIVE_FILE_VERSIONS}
          WHERE file_node_id IN (${placeholders})
          `,
        )
        .bind(...batch)
        .all();
      for (const vr of versionRows?.results || []) {
        if (vr.blob_id) versionBlobIds.push(String(vr.blob_id));
      }
    }
  }

  return { nodeBlobIds, versionBlobIds };
};

const purgeExpiredTrashForOrg = async ({ db, orgId }) => {
  const expired = await db
    .prepare(
      `
      SELECT id, node_id
      FROM ${DbTables.DRIVE_TRASH}
      WHERE org_id = ?
        AND purged_at IS NULL
        AND restored_at IS NULL
        AND purge_after IS NOT NULL
        AND purge_after <= CURRENT_TIMESTAMP
      ORDER BY purge_after ASC
      LIMIT 200
      `,
    )
    .bind(orgId)
    .all();

  const rows = expired?.results || [];
  if (!rows.length) return { purged: 0 };

  for (const row of rows) {
    const trashId = String(row.id);
    const nodeId = String(row.node_id);
    // 忽略异常，尽最大努力清理
    try {
      // 递归删除节点子树，并扣减 blob ref
      const { nodeBlobIds, versionBlobIds } = await collectBlobRefsForNodeSubtree({ db, rootNodeId: nodeId });
      await db
        .prepare(
          `
          WITH RECURSIVE subtree(id) AS (
            SELECT ?
            UNION ALL
            SELECT n.id
            FROM ${DbTables.VFS_NODES} n
            JOIN subtree s ON n.parent_id = s.id
          )
          DELETE FROM ${DbTables.VFS_NODES}
          WHERE id IN (SELECT id FROM subtree)
          `,
        )
        .bind(nodeId)
        .run();
      await purgeBlobRefs({ db, orgId, blobIds: [...nodeBlobIds, ...versionBlobIds] });
      await db
        .prepare(`UPDATE ${DbTables.DRIVE_TRASH} SET purged_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ?`)
        .bind(trashId, orgId)
        .run();
    } catch {
      // ignore
    }
  }

  return { purged: rows.length };
};

export const registerDriveRoutes = (router, helpers) => {
  const { getServiceParams } = helpers;

  // =====================
  // Trash (Recycle Bin)
  // =====================

  router.post(
    "/api/fs/drive/trash/list",
    parseJsonBody,
    usePolicy("fs.list", { pathResolver: listPathsResolver("path") }),
    async (c) => {
      const db = c.env.DB;
      const userInfo = c.get("userInfo");
      const { userIdOrInfo, userType } = getServiceParams(userInfo);
      const encryptionSecret = getEncryptionSecret(c);
      const repositoryFactory = c.get("repos");
      const body = c.get("jsonBody") || {};
      const basePath = body.path;

      const { orgId, ownerType, ownerId, scopeType, scopeId } = await resolveEcoScope({
        db,
        encryptionSecret,
        repositoryFactory,
        basePath,
        userIdOrInfo,
        userType,
        c,
      });

      await purgeExpiredTrashForOrg({ db, orgId });

      const rows = await db
        .prepare(
          `
          SELECT
            t.id AS trash_id,
            t.node_id AS node_id,
            t.deleted_at AS deleted_at,
            t.purge_after AS purge_after,
            t.original_name AS original_name,
            t.original_parent_id AS original_parent_id,
            n.node_type AS node_type,
            n.size AS size,
            n.updated_at AS updated_at
          FROM ${DbTables.DRIVE_TRASH} t
          JOIN ${DbTables.VFS_NODES} n ON n.id = t.node_id
          WHERE t.org_id = ?
            AND t.purged_at IS NULL
            AND t.restored_at IS NULL
            AND n.owner_type = ?
            AND n.owner_id = ?
            AND n.scope_type = ?
            AND n.scope_id = ?
            AND n.status = 'deleted'
          ORDER BY t.deleted_at DESC
          LIMIT 500
          `,
        )
        .bind(orgId, ownerType, ownerId, scopeType, scopeId)
        .all();

      const items = (rows?.results || []).map((r) => ({
        trashId: String(r.trash_id),
        nodeId: String(r.node_id),
        name: r.original_name ? String(r.original_name) : "",
        nodeType: r.node_type ? String(r.node_type) : "file",
        size: r.size != null ? Number(r.size) : null,
        deletedAt: r.deleted_at,
        purgeAfter: r.purge_after,
        originalParentId: r.original_parent_id ? String(r.original_parent_id) : VFS_ROOT_PARENT_ID,
      }));

      return jsonOk(c, { items, retentionDays: DEFAULT_TRASH_RETENTION_DAYS });
    },
  );

  router.post(
    "/api/fs/drive/trash/restore",
    parseJsonBody,
    usePolicy("fs.delete", { pathResolver: listPathsResolver("path") }),
    async (c) => {
      const db = c.env.DB;
      const userInfo = c.get("userInfo");
      const { userIdOrInfo, userType } = getServiceParams(userInfo);
      const encryptionSecret = getEncryptionSecret(c);
      const repositoryFactory = c.get("repos");
      const body = c.get("jsonBody") || {};
      const basePath = body.path;
      const trashId = body.trashId || body.trash_id;

      if (!trashId) throw new ValidationError("Missing trashId");

      const { orgId, ownerType, ownerId, scopeType, scopeId } = await resolveEcoScope({
        db,
        encryptionSecret,
        repositoryFactory,
        basePath,
        userIdOrInfo,
        userType,
        c,
      });

      await purgeExpiredTrashForOrg({ db, orgId });

      const row = await db
        .prepare(
          `
          SELECT *
          FROM ${DbTables.DRIVE_TRASH}
          WHERE id = ? AND org_id = ? AND purged_at IS NULL AND restored_at IS NULL
          LIMIT 1
          `,
        )
        .bind(String(trashId), orgId)
        .first();

      if (!row) throw new NotFoundError("Trash item not found");

      const nodeId = String(row.node_id);
      const originalParentId = row.original_parent_id ? String(row.original_parent_id) : VFS_ROOT_PARENT_ID;
      const originalName = row.original_name ? String(row.original_name) : "restored";

      const repo = new VfsNodesRepository(db, null);
      const node = await repo.getNodeById({ ownerType, ownerId, scopeType, scopeId, nodeId });
      if (!node) throw new NotFoundError("Node not found");

      // 目标父目录：如果原父目录已不存在/已删除，则回到 root
      let targetParentId = originalParentId;
      if (targetParentId && targetParentId !== VFS_ROOT_PARENT_ID) {
        const parent = await repo.getNodeById({ ownerType, ownerId, scopeType, scopeId, nodeId: targetParentId });
        if (!parent || parent.status !== "active" || parent.node_type !== "dir") {
          targetParentId = VFS_ROOT_PARENT_ID;
        }
      }

      const availableName = await findAvailableName({
        repo,
        ownerType,
        ownerId,
        scopeType,
        scopeId,
        parentId: targetParentId,
        desiredName: originalName,
      });

      // 先改 parent/name，再递归恢复子树
      await db
        .prepare(
          `
          UPDATE ${DbTables.VFS_NODES}
          SET parent_id = ?, name = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND owner_type = ? AND owner_id = ? AND scope_type = ? AND scope_id = ?
          `,
        )
        .bind(targetParentId, availableName, nodeId, ownerType, ownerId, scopeType, scopeId)
        .run();

      await repo.restoreNode({ ownerType, ownerId, scopeType, scopeId, nodeId });

      await db
        .prepare(`UPDATE ${DbTables.DRIVE_TRASH} SET restored_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ?`)
        .bind(String(trashId), orgId)
        .run();

      return jsonOk(c, { restored: true, nodeId, name: availableName });
    },
  );

  router.post(
    "/api/fs/drive/trash/purge",
    parseJsonBody,
    usePolicy("fs.delete", { pathResolver: listPathsResolver("path") }),
    async (c) => {
      const db = c.env.DB;
      const userInfo = c.get("userInfo");
      const { userIdOrInfo, userType } = getServiceParams(userInfo);
      const encryptionSecret = getEncryptionSecret(c);
      const repositoryFactory = c.get("repos");
      const body = c.get("jsonBody") || {};
      const basePath = body.path;
      const trashId = body.trashId || body.trash_id;

      if (!trashId) throw new ValidationError("Missing trashId");

      const { orgId, ownerType, ownerId, scopeType, scopeId } = await resolveEcoScope({
        db,
        encryptionSecret,
        repositoryFactory,
        basePath,
        userIdOrInfo,
        userType,
        c,
      });

      const row = await db
        .prepare(
          `
          SELECT *
          FROM ${DbTables.DRIVE_TRASH}
          WHERE id = ? AND org_id = ? AND purged_at IS NULL AND restored_at IS NULL
          LIMIT 1
          `,
        )
        .bind(String(trashId), orgId)
        .first();
      if (!row) throw new NotFoundError("Trash item not found");

      const nodeId = String(row.node_id);

      // 校验归属
      const repo = new VfsNodesRepository(db, null);
      const node = await repo.getNodeById({ ownerType, ownerId, scopeType, scopeId, nodeId });
      if (!node) {
        await db
          .prepare(`UPDATE ${DbTables.DRIVE_TRASH} SET purged_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ?`)
          .bind(String(trashId), orgId)
          .run();
        return jsonOk(c, { purged: true, missingNode: true });
      }

      const { nodeBlobIds, versionBlobIds } = await collectBlobRefsForNodeSubtree({ db, rootNodeId: nodeId });

      await db
        .prepare(
          `
          WITH RECURSIVE subtree(id) AS (
            SELECT ?
            UNION ALL
            SELECT n.id
            FROM ${DbTables.VFS_NODES} n
            JOIN subtree s ON n.parent_id = s.id
          )
          DELETE FROM ${DbTables.VFS_NODES}
          WHERE id IN (SELECT id FROM subtree)
          `,
        )
        .bind(nodeId)
        .run();

      await purgeBlobRefs({ db, orgId, blobIds: [...nodeBlobIds, ...versionBlobIds] });

      await db
        .prepare(`UPDATE ${DbTables.DRIVE_TRASH} SET purged_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ?`)
        .bind(String(trashId), orgId)
        .run();

      return jsonOk(c, { purged: true });
    },
  );

  router.post(
    "/api/fs/drive/trash/empty",
    parseJsonBody,
    usePolicy("fs.delete", { pathResolver: listPathsResolver("path") }),
    async (c) => {
      const db = c.env.DB;
      const userInfo = c.get("userInfo");
      const { userIdOrInfo, userType } = getServiceParams(userInfo);
      const encryptionSecret = getEncryptionSecret(c);
      const repositoryFactory = c.get("repos");
      const body = c.get("jsonBody") || {};
      const basePath = body.path;

      const { orgId, ownerType, ownerId, scopeType, scopeId } = await resolveEcoScope({
        db,
        encryptionSecret,
        repositoryFactory,
        basePath,
        userIdOrInfo,
        userType,
        c,
      });

      const rows = await db
        .prepare(
          `
          SELECT t.id AS trash_id, t.node_id AS node_id
          FROM ${DbTables.DRIVE_TRASH} t
          JOIN ${DbTables.VFS_NODES} n ON n.id = t.node_id
          WHERE t.org_id = ?
            AND t.purged_at IS NULL
            AND t.restored_at IS NULL
            AND n.owner_type = ?
            AND n.owner_id = ?
            AND n.scope_type = ?
            AND n.scope_id = ?
            AND n.status = 'deleted'
          ORDER BY t.deleted_at ASC
          LIMIT 500
          `,
        )
        .bind(orgId, ownerType, ownerId, scopeType, scopeId)
        .all();

      let purged = 0;
      for (const r of rows?.results || []) {
        const trashId = String(r.trash_id);
        const nodeId = String(r.node_id);
        const { nodeBlobIds, versionBlobIds } = await collectBlobRefsForNodeSubtree({ db, rootNodeId: nodeId });
        await db
          .prepare(
            `
            WITH RECURSIVE subtree(id) AS (
              SELECT ?
              UNION ALL
              SELECT n.id
              FROM ${DbTables.VFS_NODES} n
              JOIN subtree s ON n.parent_id = s.id
            )
            DELETE FROM ${DbTables.VFS_NODES}
            WHERE id IN (SELECT id FROM subtree)
            `,
          )
          .bind(nodeId)
          .run();
        await purgeBlobRefs({ db, orgId, blobIds: [...nodeBlobIds, ...versionBlobIds] });
        await db
          .prepare(`UPDATE ${DbTables.DRIVE_TRASH} SET purged_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ?`)
          .bind(trashId, orgId)
          .run();
        purged += 1;
      }

      return jsonOk(c, { purged });
    },
  );

  // =====================
  // Versions
  // =====================

  router.post(
    "/api/fs/drive/versions/list",
    parseJsonBody,
    usePolicy("fs.read", { pathResolver: listPathsResolver("path") }),
    async (c) => {
      const db = c.env.DB;
      const userInfo = c.get("userInfo");
      const { userIdOrInfo, userType } = getServiceParams(userInfo);
      const encryptionSecret = getEncryptionSecret(c);
      const repositoryFactory = c.get("repos");
      const body = c.get("jsonBody") || {};
      const basePath = body.path;
      const nodeId = body.nodeId || body.node_id;
      if (!nodeId) throw new ValidationError("Missing nodeId");

      const { orgId, ownerType, ownerId, scopeType, scopeId } = await resolveEcoScope({
        db,
        encryptionSecret,
        repositoryFactory,
        basePath,
        userIdOrInfo,
        userType,
        c,
      });

      const repo = new VfsNodesRepository(db, null);
      const node = await repo.getNodeById({ ownerType, ownerId, scopeType, scopeId, nodeId: String(nodeId) });
      if (!node || node.node_type !== "file" || node.status !== "active") throw new NotFoundError("File not found");

      const rows = await db
        .prepare(
          `
          SELECT id, version_no, note, sha256, size, mime_type, created_at
          FROM ${DbTables.DRIVE_FILE_VERSIONS}
          WHERE file_node_id = ? AND org_id = ?
          ORDER BY version_no DESC
          LIMIT 50
          `,
        )
        .bind(String(nodeId), orgId)
        .all();

      const items = (rows?.results || []).map((r) => ({
        id: String(r.id),
        versionNo: Number(r.version_no),
        note: r.note ? String(r.note) : null,
        sha256: r.sha256 ? String(r.sha256) : null,
        size: r.size != null ? Number(r.size) : null,
        mimeType: r.mime_type ? String(r.mime_type) : null,
        createdAt: r.created_at,
      }));

      return jsonOk(c, { items, maxVersions: MAX_FILE_VERSIONS });
    },
  );

  router.post(
    "/api/fs/drive/versions/create",
    parseJsonBody,
    usePolicy("fs.upload", { pathResolver: listPathsResolver("path") }),
    async (c) => {
      const db = c.env.DB;
      const userInfo = c.get("userInfo");
      const { userIdOrInfo, userType } = getServiceParams(userInfo);
      const encryptionSecret = getEncryptionSecret(c);
      const repositoryFactory = c.get("repos");
      const body = c.get("jsonBody") || {};
      const basePath = body.path;
      const nodeId = body.nodeId || body.node_id;
      const note = body.note != null ? String(body.note) : null;
      if (!nodeId) throw new ValidationError("Missing nodeId");

      const { orgId, ownerType, ownerId, scopeType, scopeId, userId } = await resolveEcoScope({
        db,
        encryptionSecret,
        repositoryFactory,
        basePath,
        userIdOrInfo,
        userType,
        c,
      });

      const repo = new VfsNodesRepository(db, null);
      const node = await repo.getNodeById({ ownerType, ownerId, scopeType, scopeId, nodeId: String(nodeId) });
      if (!node || node.node_type !== "file" || node.status !== "active") throw new NotFoundError("File not found");

      const contentRef = typeof node.content_ref === "string" ? node.content_ref : "";
      if (!contentRef.startsWith("blob:")) throw new ValidationError("Not a drive file");
      const blobId = contentRef.slice("blob:".length);

      const latest = await db
        .prepare(
          `
          SELECT COALESCE(MAX(version_no), 0) AS max_no
          FROM ${DbTables.DRIVE_FILE_VERSIONS}
          WHERE file_node_id = ? AND org_id = ?
          `,
        )
        .bind(String(nodeId), orgId)
        .first();
      const nextNo = Number(latest?.max_no || 0) + 1;
      const versionId = `drv_ver_${generateUUID()}`;

      await db
        .prepare(
          `
          INSERT INTO ${DbTables.DRIVE_FILE_VERSIONS}
            (id, file_node_id, version_no, org_id, blob_id, sha256, storage_key, size, mime_type, note, created_by, created_at)
          SELECT
            ?, ?, ?, ?, b.id, b.sha256, b.storage_key, b.size, b.mime_type, ?, ?, CURRENT_TIMESTAMP
          FROM ${DbTables.DRIVE_BLOBS} b
          WHERE b.id = ? AND b.org_id = ?
          `,
        )
        .bind(versionId, String(nodeId), nextNo, orgId, note, userId, blobId, orgId)
        .run();

      // 版本持有一次引用
      await db
        .prepare(`UPDATE ${DbTables.DRIVE_BLOBS} SET ref_count = ref_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ?`)
        .bind(blobId, orgId)
        .run();

      // 保留最近 10 个版本：删除多余的最旧版本并扣减引用
      const extra = await db
        .prepare(
          `
          SELECT id, blob_id
          FROM ${DbTables.DRIVE_FILE_VERSIONS}
          WHERE file_node_id = ? AND org_id = ?
          ORDER BY version_no DESC
          LIMIT 100
          `,
        )
        .bind(String(nodeId), orgId)
        .all();
      const all = extra?.results || [];
      if (all.length > MAX_FILE_VERSIONS) {
        const toDelete = all.slice(MAX_FILE_VERSIONS);
        for (const v of toDelete) {
          await db
            .prepare(`DELETE FROM ${DbTables.DRIVE_FILE_VERSIONS} WHERE id = ? AND org_id = ?`)
            .bind(String(v.id), orgId)
            .run();
          if (v.blob_id) {
            await purgeBlobRefs({ db, orgId, blobIds: [String(v.blob_id)] });
          }
        }
      }

      return jsonOk(c, { created: true, id: versionId, versionNo: nextNo });
    },
  );

  router.post(
    "/api/fs/drive/versions/restore",
    parseJsonBody,
    usePolicy("fs.upload", { pathResolver: listPathsResolver("path") }),
    async (c) => {
      const db = c.env.DB;
      const userInfo = c.get("userInfo");
      const { userIdOrInfo, userType } = getServiceParams(userInfo);
      const encryptionSecret = getEncryptionSecret(c);
      const repositoryFactory = c.get("repos");
      const body = c.get("jsonBody") || {};
      const basePath = body.path;
      const nodeId = body.nodeId || body.node_id;
      const versionId = body.versionId || body.version_id;
      if (!nodeId || !versionId) throw new ValidationError("Missing nodeId/versionId");

      const { orgId, ownerType, ownerId, scopeType, scopeId, userId } = await resolveEcoScope({
        db,
        encryptionSecret,
        repositoryFactory,
        basePath,
        userIdOrInfo,
        userType,
        c,
      });

      const repo = new VfsNodesRepository(db, null);
      const node = await repo.getNodeById({ ownerType, ownerId, scopeType, scopeId, nodeId: String(nodeId) });
      if (!node || node.node_type !== "file" || node.status !== "active") throw new NotFoundError("File not found");

      const v = await db
        .prepare(
          `
          SELECT id, blob_id, sha256, storage_key, size, mime_type, version_no
          FROM ${DbTables.DRIVE_FILE_VERSIONS}
          WHERE id = ? AND file_node_id = ? AND org_id = ?
          LIMIT 1
          `,
        )
        .bind(String(versionId), String(nodeId), orgId)
        .first();
      if (!v) throw new NotFoundError("Version not found");
      if (!v.blob_id) throw new ValidationError("Version blob missing");

      // 先把“当前”保存为一个新版本（可追溯）
      const currentRef = typeof node.content_ref === "string" ? node.content_ref : "";
      let currentBlobId = null;
      if (currentRef.startsWith("blob:")) currentBlobId = currentRef.slice("blob:".length);
      if (currentBlobId) {
        const latest = await db
          .prepare(
            `SELECT COALESCE(MAX(version_no), 0) AS max_no FROM ${DbTables.DRIVE_FILE_VERSIONS} WHERE file_node_id = ? AND org_id = ?`,
          )
          .bind(String(nodeId), orgId)
          .first();
        const nextNo = Number(latest?.max_no || 0) + 1;
        const autoId = `drv_ver_${generateUUID()}`;
        await db
          .prepare(
            `
            INSERT INTO ${DbTables.DRIVE_FILE_VERSIONS}
              (id, file_node_id, version_no, org_id, blob_id, sha256, storage_key, size, mime_type, note, created_by, created_at)
            SELECT
              ?, ?, ?, ?, b.id, b.sha256, b.storage_key, b.size, b.mime_type, ?, ?, CURRENT_TIMESTAMP
            FROM ${DbTables.DRIVE_BLOBS} b
            WHERE b.id = ? AND b.org_id = ?
            `,
          )
          .bind(autoId, String(nodeId), nextNo, orgId, "恢复前自动版本", userId, currentBlobId, orgId)
          .run();
        await db
          .prepare(`UPDATE ${DbTables.DRIVE_BLOBS} SET ref_count = ref_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ?`)
          .bind(currentBlobId, orgId)
          .run();
      }

      // 切换到目标版本：目标 blob 额外被 node 引用一次
      const targetBlobId = String(v.blob_id);
      await db
        .prepare(`UPDATE ${DbTables.DRIVE_BLOBS} SET ref_count = ref_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ?`)
        .bind(targetBlobId, orgId)
        .run();

      // old blob 被 node 解除引用一次（但可能已被版本持有）
      if (currentBlobId) {
        await purgeBlobRefs({ db, orgId, blobIds: [currentBlobId] });
      }

      await db
        .prepare(
          `
          UPDATE ${DbTables.VFS_NODES}
          SET content_ref = ?, hash_algo = 'sha256', hash_value = ?, size = ?, mime_type = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND owner_type = ? AND owner_id = ? AND scope_type = ? AND scope_id = ? AND status = 'active'
          `,
        )
        .bind(`blob:${targetBlobId}`, String(v.sha256 || ""), v.size != null ? Number(v.size) : null, v.mime_type || null, String(nodeId), ownerType, ownerId, scopeType, scopeId)
        .run();

      // 再次裁剪到 10
      const rows = await db
        .prepare(
          `
          SELECT id, blob_id
          FROM ${DbTables.DRIVE_FILE_VERSIONS}
          WHERE file_node_id = ? AND org_id = ?
          ORDER BY version_no DESC
          LIMIT 100
          `,
        )
        .bind(String(nodeId), orgId)
        .all();
      const all = rows?.results || [];
      if (all.length > MAX_FILE_VERSIONS) {
        const toDelete = all.slice(MAX_FILE_VERSIONS);
        for (const dv of toDelete) {
          await db
            .prepare(`DELETE FROM ${DbTables.DRIVE_FILE_VERSIONS} WHERE id = ? AND org_id = ?`)
            .bind(String(dv.id), orgId)
            .run();
          if (dv.blob_id) {
            await purgeBlobRefs({ db, orgId, blobIds: [String(dv.blob_id)] });
          }
        }
      }

      return jsonOk(c, { restored: true });
    },
  );
};

