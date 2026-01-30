<template>
  <aside
    class="drive-sidebar shrink-0 w-64 border-r"
    :class="darkMode ? 'border-gray-700 bg-gray-900/20' : 'border-gray-200 bg-gray-50/60'"
  >
    <div class="p-3">
      <section>
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs font-semibold" :class="darkMode ? 'text-gray-200' : 'text-gray-800'">快速访问</div>
        </div>

        <div v-if="quickAccess.length === 0" class="text-xs py-2" :class="darkMode ? 'text-gray-500' : 'text-gray-500'">
          暂无固定文件夹
        </div>

        <ul v-else class="space-y-1">
          <li v-for="item in quickAccess" :key="item.path" class="group flex items-center justify-between gap-2">
            <a
              href="#"
              class="flex items-center gap-2 min-w-0 px-2 py-1 rounded text-xs"
              :class="
                isActive(item.path)
                  ? darkMode
                    ? 'bg-gray-800 text-gray-100'
                    : 'bg-white text-gray-900'
                  : darkMode
                    ? 'text-gray-200 hover:bg-gray-800'
                    : 'text-gray-700 hover:bg-white'
              "
              @click.prevent="emitNavigate(item.path)"
              @mouseenter="emitPrefetch(item.path)"
            >
              <IconFolder size="sm" class="w-4 h-4 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ item.name }}</span>
            </a>
            <button
              type="button"
              class="opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-1 rounded text-xs"
              :class="darkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-white'"
              @click="removeQuickAccess(item.path)"
              title="移除"
            >
              ×
            </button>
          </li>
        </ul>
      </section>

      <div class="my-4 border-t" :class="darkMode ? 'border-gray-800' : 'border-gray-200'"></div>

      <section>
        <div class="text-xs font-semibold mb-2" :class="darkMode ? 'text-gray-200' : 'text-gray-800'">目录</div>

        <div class="space-y-1">
          <button
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs"
            :class="
              isActive(rootPathNormalized)
                ? darkMode
                  ? 'bg-gray-800 text-gray-100'
                  : 'bg-white text-gray-900'
                : darkMode
                  ? 'text-gray-200 hover:bg-gray-800'
                  : 'text-gray-700 hover:bg-white'
            "
            @click="emitNavigate(rootPathNormalized)"
            @mouseenter="emitPrefetch(rootPathNormalized)"
          >
            <IconFolderOpen size="sm" class="w-4 h-4 shrink-0" aria-hidden="true" />
            <span class="truncate">{{ rootLabelComputed }}</span>
          </button>

          <div class="ml-4 mt-1 space-y-0.5">
            <div v-if="rootNode.loading" class="text-xs py-1" :class="darkMode ? 'text-gray-500' : 'text-gray-500'">加载中…</div>
            <div v-else-if="rootNode.error" class="text-xs py-1" :class="darkMode ? 'text-red-300' : 'text-red-600'">
              加载失败
              <button class="underline ml-1" type="button" @click="loadChildren(rootPathNormalized)">重试</button>
            </div>
            <template v-else>
              <DriveTreeNode
                v-for="child in rootNode.children"
                :key="child.path"
                :node="child"
                :dark-mode="darkMode"
                :current-path="currentPathNormalized"
                @navigate="emitNavigate"
                @prefetch="emitPrefetch"
                @toggle="toggleExpand"
              />
            </template>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup>
import { computed, reactive, watch } from "vue";
import { useFsService } from "@/modules/fs/fsService.js";
import { normalizeFsPath, toDirApiPath, isSameOrSubPath } from "@/utils/fsPathUtils.js";
import { IconFolder, IconFolderOpen } from "@/components/icons";
import DriveTreeNode from "@/modules/fs/components/shared/DriveTreeNode.vue";

const props = defineProps({
  rootPath: { type: String, required: true },
  rootLabel: { type: String, default: "" },
  currentPath: { type: String, required: true },
  darkMode: { type: Boolean, default: false },
});

const emit = defineEmits(["navigate", "prefetch"]);
const fsService = useFsService();

const rootPathNormalized = computed(() => normalizeFsPath(props.rootPath || "/"));
const currentPathNormalized = computed(() => normalizeFsPath(props.currentPath || "/"));
const rootLabelComputed = computed(() => props.rootLabel || "网盘");

const quickAccessStorageKey = computed(() => `eco-drive:quick-access:${rootPathNormalized.value}`);
const quickAccess = reactive([]);

const loadQuickAccess = () => {
  quickAccess.splice(0, quickAccess.length);
  try {
    const raw = localStorage.getItem(quickAccessStorageKey.value);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      parsed
        .filter((x) => x && typeof x.path === "string")
        .forEach((x) => {
          const p = normalizeFsPath(x.path);
          if (!p) return;
          if (rootPathNormalized.value !== "/" && !(p === rootPathNormalized.value || p.startsWith(`${rootPathNormalized.value}/`))) return;
          quickAccess.push({ path: p, name: String(x.name || p.split("/").filter(Boolean).slice(-1)[0] || p) });
        });
    }
  } catch {
    // ignore
  }
};

const persistQuickAccess = () => {
  try {
    localStorage.setItem(quickAccessStorageKey.value, JSON.stringify(quickAccess));
  } catch {
    // ignore
  }
};

const addQuickAccess = (path, name) => {
  const p = normalizeFsPath(path);
  if (!p) return false;

  const base = rootPathNormalized.value;
  if (base !== "/" && !(p === base || p.startsWith(`${base}/`))) return false;
  if (quickAccess.some((x) => x.path === p)) return true;

  const displayName = String(name || p.split("/").filter(Boolean).slice(-1)[0] || p);
  quickAccess.unshift({ path: p, name: displayName });
  persistQuickAccess();
  return true;
};

const removeQuickAccess = (path) => {
  const p = normalizeFsPath(path);
  const idx = quickAccess.findIndex((x) => x.path === p);
  if (idx >= 0) {
    quickAccess.splice(idx, 1);
    persistQuickAccess();
  }
};

const emitNavigate = (path) => emit("navigate", normalizeFsPath(path));
const emitPrefetch = (path) => emit("prefetch", normalizeFsPath(path));

const isActive = (path) => normalizeFsPath(path) === currentPathNormalized.value;
const isDirectoryItem = (item) => Boolean(item?.isDirectory || item?.is_dir || item?.type === "directory");

const nodes = reactive(new Map());
const ensureNode = (path) => {
  const p = normalizeFsPath(path);
  if (!nodes.has(p)) {
    nodes.set(p, { path: p, name: p.split("/").filter(Boolean).slice(-1)[0] || p, loading: false, error: null, expanded: false, children: [] });
  }
  return nodes.get(p);
};

const rootNode = computed(() => ensureNode(rootPathNormalized.value));

const loadChildren = async (path) => {
  const p = normalizeFsPath(path);
  const node = ensureNode(p);
  node.loading = true;
  node.error = null;
  try {
    const data = await fsService.getDirectoryList(toDirApiPath(p));
    const dirs = (data?.items || []).filter(isDirectoryItem);
    node.children = dirs
      .map((d) => {
        const childPath = normalizeFsPath(d.path || `${p}/${d.name}`);
        const child = ensureNode(childPath);
        child.name = d.name || child.name;
        return child;
      })
      .filter((c) => c.path && isSameOrSubPath(rootPathNormalized.value, c.path));
    node.expanded = true;
  } catch (e) {
    node.error = e?.message || "error";
  } finally {
    node.loading = false;
  }
};

const syncFromDirectoryList = (path, items) => {
  const p = normalizeFsPath(path);
  if (!p || !Array.isArray(items)) return;

  const base = rootPathNormalized.value;
  if (base !== "/" && !(p === base || p.startsWith(`${base}/`))) return;

  const node = ensureNode(p);
  const dirs = items.filter(isDirectoryItem);
  node.children = dirs
    .map((d) => {
      const childPath = normalizeFsPath(d.path || `${p}/${d.name}`);
      const child = ensureNode(childPath);
      child.name = d.name || child.name;
      return child;
    })
    .filter((c) => c.path && isSameOrSubPath(base, c.path));

  node.error = null;
  node.loading = false;
};

const toggleExpand = async (path) => {
  const p = normalizeFsPath(path);
  const node = ensureNode(p);
  node.expanded = !node.expanded;
  if (node.expanded && node.children.length === 0 && !node.loading) {
    await loadChildren(p);
  }
};

watch(
  () => rootPathNormalized.value,
  async () => {
    nodes.clear();
    ensureNode(rootPathNormalized.value);
    loadQuickAccess();
    await loadChildren(rootPathNormalized.value);
  },
  { immediate: true }
);

defineExpose({ addQuickAccess, syncFromDirectoryList });
</script>
