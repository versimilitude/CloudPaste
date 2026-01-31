/**
 * Eco Drive (Scheme B) API
 * - Recycle Bin (Trash)
 * - File Versions
 */

import { post } from "../client";

// =====================
// Trash / Recycle Bin
// =====================

export async function listTrash(path) {
  return post("/fs/drive/trash/list", { path });
}

export async function restoreTrashItem(path, trashId) {
  return post("/fs/drive/trash/restore", { path, trashId });
}

export async function purgeTrashItem(path, trashId) {
  return post("/fs/drive/trash/purge", { path, trashId });
}

export async function emptyTrash(path) {
  return post("/fs/drive/trash/empty", { path });
}

// =====================
// Versions
// =====================

export async function listFileVersions(path, nodeId) {
  return post("/fs/drive/versions/list", { path, nodeId });
}

export async function createFileVersion(path, nodeId, note) {
  return post("/fs/drive/versions/create", { path, nodeId, note });
}

export async function restoreFileVersion(path, nodeId, versionId) {
  return post("/fs/drive/versions/restore", { path, nodeId, versionId });
}

