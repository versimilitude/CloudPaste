<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[70] overflow-hidden bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4"
    @click.self="close"
    @keydown.esc="close"
  >
    <div class="relative w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col" style="max-width: 760px; max-height: 560px">
      <div class="flex-shrink-0 px-4 py-3 border-b flex justify-between items-center" :class="darkMode ? 'border-gray-700' : 'border-gray-200'">
        <div class="min-w-0">
          <div class="text-base font-medium truncate" :class="darkMode ? 'text-gray-100' : 'text-gray-900'">版本历史</div>
          <div class="text-xs mt-0.5 truncate" :class="darkMode ? 'text-gray-400' : 'text-gray-600'">
            {{ fileName }}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
            :class="darkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'"
            :disabled="loading || !nodeId"
            @click="openCreateDialog"
          >
            创建版本
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
            :class="darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-100' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'"
            :disabled="loading"
            @click="load"
          >
            刷新
          </button>
          <button
            type="button"
            class="p-2 rounded-full transition-colors"
            :class="darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'"
            @click="close"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div v-if="error" class="m-4 p-3 rounded border text-xs" :class="darkMode ? 'border-red-800 bg-red-900/20 text-red-200' : 'border-red-200 bg-red-50 text-red-700'">
          {{ error }}
        </div>

        <div v-if="loading && versions.length === 0" class="py-10 text-center text-xs" :class="darkMode ? 'text-gray-300' : 'text-gray-600'">
          加载中…
        </div>

        <div v-else-if="versions.length === 0" class="py-10 text-center text-xs" :class="darkMode ? 'text-gray-300' : 'text-gray-600'">
          暂无版本
        </div>

        <div v-else class="m-4 overflow-auto rounded border" :class="darkMode ? 'border-gray-700' : 'border-gray-200'">
          <table class="min-w-full text-xs">
            <thead :class="darkMode ? 'bg-gray-800 text-gray-200' : 'bg-gray-50 text-gray-700'">
              <tr>
                <th class="px-3 py-2 text-left w-20">版本</th>
                <th class="px-3 py-2 text-left w-44">时间</th>
                <th class="px-3 py-2 text-left">备注</th>
                <th class="px-3 py-2 text-right w-32">大小</th>
                <th class="px-3 py-2 text-right w-24">操作</th>
              </tr>
            </thead>
            <tbody :class="darkMode ? 'divide-y divide-gray-800' : 'divide-y divide-gray-200'">
              <tr v-for="v in versions" :key="v.id" :class="darkMode ? 'hover:bg-gray-800/60' : 'hover:bg-gray-50'">
                <td class="px-3 py-2">v{{ v.versionNo }}</td>
                <td class="px-3 py-2">{{ formatDateTimeSafe(v.createdAt) }}</td>
                <td class="px-3 py-2">
                  <div class="truncate max-w-[360px]" :title="v.note || ''">{{ v.note || '-' }}</div>
                </td>
                <td class="px-3 py-2 text-right">{{ formatSize(v.size) }}</td>
                <td class="px-3 py-2 text-right">
                  <button
                    type="button"
                    class="px-2 py-1 rounded text-xs font-medium transition-colors"
                    :class="darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-100' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'"
                    :disabled="loading"
                    @click="confirmRestore(v)"
                  >
                    还原
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        :is-open="confirmRestoreOpen"
        title="还原版本"
        :message="confirmRestoreMessage"
        confirm-text="还原"
        cancel-text="取消"
        @confirm="doRestore"
        @cancel="confirmRestoreOpen = false"
        @close="confirmRestoreOpen = false"
      />

      <InputDialog
        :is-open="createDialogOpen"
        title="创建版本"
        label="备注（可选）"
        placeholder="例如：提交前备份"
        confirm-text="创建"
        cancel-text="取消"
        @confirm="doCreate"
        @cancel="createDialogOpen = false"
        @close="createDialogOpen = false"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { api } from "@/api";
import { useUIState } from "@/composables/ui-interaction/useUIState.js";
import ConfirmDialog from "@/components/common/dialogs/ConfirmDialog.vue";
import InputDialog from "@/components/common/dialogs/InputDialog.vue";
import { formatDateTime } from "@/utils/timeUtils.js";

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  darkMode: { type: Boolean, default: false },
  basePath: { type: String, required: true },
  fileItem: { type: Object, default: null },
});

const emit = defineEmits(["close", "restored"]);

const ui = useUIState();

const versions = ref([]);
const maxVersions = ref(10);
const loading = ref(false);
const error = ref(null);

const nodeId = computed(() => {
  const id = props.fileItem?.vfs_node_id ?? props.fileItem?.vfsNodeId ?? props.fileItem?.nodeId ?? null;
  return id != null ? String(id) : null;
});

const fileName = computed(() => String(props.fileItem?.name || props.fileItem?.originalName || props.fileItem?.path || ""));

const confirmRestoreOpen = ref(false);
const targetVersion = ref(null);

const createDialogOpen = ref(false);

const confirmRestoreMessage = computed(() => {
  if (!targetVersion.value) return "确定要还原该版本吗？当前内容将自动保存为一个版本。";
  return `确定要还原 v${targetVersion.value.versionNo} 吗？当前内容将自动保存为一个版本。`;
});

const formatDateTimeSafe = (value) => {
  if (!value) return "-";
  try {
    return formatDateTime(value);
  } catch {
    return String(value);
  }
};

const formatSize = (size) => {
  const n = Number(size || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const fixed = i === 0 ? String(Math.round(v)) : v.toFixed(v >= 10 ? 1 : 2);
  return `${fixed} ${units[i]}`;
};

const load = async () => {
  if (!props.isOpen) return;
  if (!nodeId.value) {
    versions.value = [];
    error.value = "该文件缺少索引信息，无法读取版本历史";
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const resp = await api.drive.listFileVersions(props.basePath, nodeId.value);
    if (!resp?.success) throw new Error(resp?.message || "加载版本失败");
    versions.value = Array.isArray(resp.data?.items) ? resp.data.items : [];
    maxVersions.value = Number(resp.data?.maxVersions || 10);
  } catch (e) {
    error.value = e?.message || "加载版本失败";
  } finally {
    loading.value = false;
  }
};

const close = () => emit("close");

const confirmRestore = (v) => {
  targetVersion.value = v;
  confirmRestoreOpen.value = true;
};

const doRestore = async () => {
  confirmRestoreOpen.value = false;
  if (!nodeId.value || !targetVersion.value?.id) return;
  loading.value = true;
  try {
    const resp = await api.drive.restoreFileVersion(props.basePath, nodeId.value, targetVersion.value.id);
    if (!resp?.success) throw new Error(resp?.message || "还原失败");
    ui.showMessage("success", "已还原版本");
    emit("restored");
    await load();
  } catch (e) {
    ui.showMessage("error", e?.message || "还原失败");
  } finally {
    loading.value = false;
  }
};

const openCreateDialog = () => {
  createDialogOpen.value = true;
};

const doCreate = async (note) => {
  createDialogOpen.value = false;
  if (!nodeId.value) return;
  loading.value = true;
  try {
    const resp = await api.drive.createFileVersion(props.basePath, nodeId.value, note || null);
    if (!resp?.success) throw new Error(resp?.message || "创建失败");
    ui.showMessage("success", "已创建版本");
    await load();
  } catch (e) {
    ui.showMessage("error", e?.message || "创建失败");
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.isOpen,
  (open) => {
    if (open) void load();
  },
);

watch(
  () => nodeId.value,
  () => {
    if (props.isOpen) void load();
  },
);
</script>

