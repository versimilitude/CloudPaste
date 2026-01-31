<template>
  <div class="drive-trash">
    <div class="flex items-center justify-between gap-3 mb-3">
      <div class="min-w-0">
        <div class="text-base font-medium" :class="darkMode ? 'text-gray-100' : 'text-gray-900'">回收站</div>
        <div class="text-xs mt-0.5" :class="darkMode ? 'text-gray-400' : 'text-gray-600'">
          默认保留 {{ retentionDays }} 天，超期将自动清理
        </div>
      </div>
      <div class="shrink-0"></div>
    </div>

    <div class="flex items-center justify-between gap-3 mb-3">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
          :class="darkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'"
          :disabled="selectedIds.length === 0 || loading"
          @click="confirmRestoreOpen = true"
        >
          还原
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
          :class="darkMode ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-red-600 hover:bg-red-500 text-white'"
          :disabled="selectedIds.length === 0 || loading"
          @click="confirmPurgeOpen = true"
        >
          永久删除
        </button>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
          :class="darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-100' : 'bg-gray-900 hover:bg-gray-800 text-white'"
          :disabled="items.length === 0 || loading"
          @click="confirmEmptyOpen = true"
        >
          清空回收站
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
      </div>
    </div>

    <div v-if="error" class="mb-3 p-3 rounded border text-xs" :class="darkMode ? 'border-red-800 bg-red-900/20 text-red-200' : 'border-red-200 bg-red-50 text-red-700'">
      {{ error }}
    </div>

    <div v-if="loading && items.length === 0" class="py-10 text-center text-xs" :class="darkMode ? 'text-gray-300' : 'text-gray-600'">
      加载中…
    </div>

    <div v-else-if="items.length === 0" class="py-10 text-center text-xs" :class="darkMode ? 'text-gray-300' : 'text-gray-600'">
      回收站为空
    </div>

    <div v-else class="overflow-auto rounded border" :class="darkMode ? 'border-gray-700' : 'border-gray-200'">
      <table class="min-w-full text-xs">
        <thead :class="darkMode ? 'bg-gray-800 text-gray-200' : 'bg-gray-50 text-gray-700'">
          <tr>
            <th class="px-3 py-2 text-left w-10">
              <input type="checkbox" :checked="allSelected" @change="toggleAll" />
            </th>
            <th class="px-3 py-2 text-left">名称</th>
            <th class="px-3 py-2 text-left w-24">类型</th>
            <th class="px-3 py-2 text-right w-28">大小</th>
            <th class="px-3 py-2 text-left w-44">删除时间</th>
            <th class="px-3 py-2 text-left w-44">自动清理时间</th>
          </tr>
        </thead>
        <tbody :class="darkMode ? 'divide-y divide-gray-800' : 'divide-y divide-gray-200'">
          <tr v-for="it in items" :key="it.trashId" :class="darkMode ? 'hover:bg-gray-800/60' : 'hover:bg-gray-50'">
            <td class="px-3 py-2">
              <input type="checkbox" :checked="selectedMap.has(it.trashId)" @change="toggleOne(it.trashId)" />
            </td>
            <td class="px-3 py-2">
              <div class="truncate max-w-[420px]" :title="it.name">{{ it.name }}</div>
            </td>
            <td class="px-3 py-2">{{ it.nodeType === 'dir' ? '文件夹' : '文件' }}</td>
            <td class="px-3 py-2 text-right">{{ formatSize(it.size) }}</td>
            <td class="px-3 py-2">{{ formatDateTimeSafe(it.deletedAt) }}</td>
            <td class="px-3 py-2">{{ formatDateTimeSafe(it.purgeAfter) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <ConfirmDialog
      :is-open="confirmRestoreOpen"
      title="还原"
      :message="`确定要还原选中的 ${selectedIds.length} 个项目吗？`"
      confirm-text="还原"
      cancel-text="取消"
      @confirm="restoreSelected"
      @cancel="confirmRestoreOpen = false"
      @close="confirmRestoreOpen = false"
    />

    <ConfirmDialog
      :is-open="confirmPurgeOpen"
      title="永久删除"
      :message="`确定要永久删除选中的 ${selectedIds.length} 个项目吗？此操作不可撤销。`"
      confirm-text="删除"
      cancel-text="取消"
      @confirm="purgeSelected"
      @cancel="confirmPurgeOpen = false"
      @close="confirmPurgeOpen = false"
    />

    <ConfirmDialog
      :is-open="confirmEmptyOpen"
      title="清空回收站"
      message="确定要清空回收站吗？此操作不可撤销。"
      confirm-text="清空"
      cancel-text="取消"
      @confirm="emptyAll"
      @cancel="confirmEmptyOpen = false"
      @close="confirmEmptyOpen = false"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { api } from "@/api";
import { useUIState } from "@/composables/ui-interaction/useUIState.js";
import ConfirmDialog from "@/components/common/dialogs/ConfirmDialog.vue";
import { formatDateTime } from "@/utils/timeUtils.js";

const props = defineProps({
  basePath: { type: String, required: true },
  darkMode: { type: Boolean, default: false },
});

const emit = defineEmits(["close"]);

const ui = useUIState();

const loading = ref(false);
const error = ref(null);
const items = ref([]);
const retentionDays = ref(30);

const selectedMap = reactive(new Map());

const selectedIds = computed(() => Array.from(selectedMap.keys()));
const allSelected = computed(() => items.value.length > 0 && selectedIds.value.length === items.value.length);

const confirmRestoreOpen = ref(false);
const confirmPurgeOpen = ref(false);
const confirmEmptyOpen = ref(false);

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

const toggleOne = (trashId) => {
  const id = String(trashId);
  if (selectedMap.has(id)) selectedMap.delete(id);
  else selectedMap.set(id, true);
};

const toggleAll = () => {
  if (allSelected.value) {
    selectedMap.clear();
    return;
  }
  selectedMap.clear();
  for (const it of items.value) {
    selectedMap.set(String(it.trashId), true);
  }
};

const load = async () => {
  if (!props.basePath) return;
  loading.value = true;
  error.value = null;
  try {
    const resp = await api.drive.listTrash(props.basePath);
    if (!resp?.success) throw new Error(resp?.message || "加载回收站失败");
    items.value = Array.isArray(resp.data?.items) ? resp.data.items : [];
    retentionDays.value = Number(resp.data?.retentionDays || 30);
    selectedMap.clear();
  } catch (e) {
    error.value = e?.message || "加载回收站失败";
  } finally {
    loading.value = false;
  }
};

const restoreSelected = async () => {
  confirmRestoreOpen.value = false;
  if (selectedIds.value.length === 0) return;
  loading.value = true;
  try {
    for (const id of selectedIds.value) {
      await api.drive.restoreTrashItem(props.basePath, id);
    }
    ui.showMessage("success", "已还原");
    await load();
  } catch (e) {
    ui.showMessage("error", e?.message || "还原失败");
  } finally {
    loading.value = false;
  }
};

const purgeSelected = async () => {
  confirmPurgeOpen.value = false;
  if (selectedIds.value.length === 0) return;
  loading.value = true;
  try {
    for (const id of selectedIds.value) {
      await api.drive.purgeTrashItem(props.basePath, id);
    }
    ui.showMessage("success", "已永久删除");
    await load();
  } catch (e) {
    ui.showMessage("error", e?.message || "删除失败");
  } finally {
    loading.value = false;
  }
};

const emptyAll = async () => {
  confirmEmptyOpen.value = false;
  loading.value = true;
  try {
    const resp = await api.drive.emptyTrash(props.basePath);
    if (!resp?.success) throw new Error(resp?.message || "清空失败");
    ui.showMessage("success", "回收站已清空");
    await load();
  } catch (e) {
    ui.showMessage("error", e?.message || "清空失败");
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.basePath,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<style scoped>
.drive-trash {
  width: 100%;
}
</style>
