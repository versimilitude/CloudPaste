<template>
  <div>
    <div class="flex flex-wrap items-center justify-end gap-2 py-2">
      <!-- View mode toggle -->
      <div class="flex rounded-md overflow-hidden border" :class="darkMode ? 'border-gray-700' : 'border-gray-300'">
        <button
          @click="changeViewMode('list')"
          class="inline-flex items-center px-2 py-1.5 transition-colors text-sm"
          :class="[viewMode === 'list' ? (darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800') : darkMode ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-500']"
          :title="t('mount.viewModes.list')"
        >
          <IconList size="sm" />
        </button>

        <button
          @click="changeViewMode('grid')"
          class="inline-flex items-center px-2 py-1.5 transition-colors text-sm"
          :class="[viewMode === 'grid' ? (darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800') : darkMode ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-500']"
          :title="t('mount.viewModes.grid')"
        >
          <IconGrid size="sm" />
        </button>

        <button
          @click="changeViewMode('gallery')"
          class="inline-flex items-center px-2 py-1.5 transition-colors text-sm"
          :class="[
            viewMode === 'gallery'
              ? (darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800')
              : darkMode
                ? 'bg-gray-800 text-gray-400'
                : 'bg-white text-gray-500',
          ]"
          :title="t('mount.viewModes.gallery')"
        >
          <IconGallery size="sm" />
        </button>
      </div>

      <!-- Refresh -->
      <button
        @click="$emit('refresh')"
        class="inline-flex items-center px-3 py-1.5 rounded-md transition-colors text-sm font-medium"
        :class="darkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'"
        :title="t('mount.operations.refresh')"
      >
        <IconRefresh size="sm" />
      </button>

      <!-- Actions dropdown -->
      <div class="relative" ref="actionsMenuRef">
        <button
          type="button"
          @click="toggleActionsMenu"
          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all duration-200 hover:shadow-sm"
          :class="
            darkMode
              ? 'border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-gray-200'
              : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
          "
          :title="t('mount.operations.actions')"
        >
          <span class="text-sm">{{ t('mount.operations.actions') }}</span>
          <IconChevronDown size="sm" class="w-4 h-4" aria-hidden="true" />
        </button>

        <div
          v-if="showActionsMenu"
          class="absolute right-0 mt-2 w-52 rounded-md shadow-lg border z-50 overflow-hidden"
          :class="darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'"
        >
          <div class="py-1">
            <button
              v-if="!isVirtual"
              type="button"
              @click="handleActionUpload"
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
              :class="darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'"
            >
              <IconUpload size="sm" class="w-4 h-4" />
              <span>{{ t('mount.operations.upload') }}</span>
            </button>

            <button
              v-if="!isVirtual"
              type="button"
              @click="handleActionCreateFolder"
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
              :class="darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'"
            >
              <IconFolderPlus size="sm" class="w-4 h-4" />
              <span>{{ t('mount.operations.createFolder') }}</span>
            </button>

            <button
              type="button"
              @click="handleActionOpenBasket"
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
              :class="darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'"
            >
              <IconShoppingCart size="sm" class="w-4 h-4" />
              <span>{{ t('fileBasket.title') }}</span>
            </button>

            <button
              type="button"
              @click="handleActionOpenTasks"
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
              :class="darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'"
            >
              <IconTaskList size="sm" class="w-4 h-4" />
              <span>{{ t('mount.operations.tasks') }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Search -->
      <button
        type="button"
        @click="$emit('openSearchModal')"
        class="p-2 rounded-md border transition-all duration-200 hover:shadow-sm"
        :class="
          darkMode
            ? 'border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-gray-200'
            : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-700'
        "
        :title="t('search.title')"
      >
        <IconSearch size="sm" class="w-4 h-4" aria-hidden="true" />
      </button>

      <!-- Settings -->
      <button
        type="button"
        @click="$emit('openSettingsDrawer')"
        class="p-2 rounded-md border transition-all duration-200 hover:shadow-sm"
        :class="
          darkMode
            ? 'border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-gray-200'
            : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-700'
        "
        :title="t('mount.settings.title')"
      >
        <IconSettings size="sm" class="w-4 h-4" aria-hidden="true" />
      </button>
    </div>

    <!-- File basket panel -->
    <FileBasketPanel
      v-if="isBasketOpen"
      :is-open="isBasketOpen"
      :dark-mode="darkMode"
      @close="closeBasket"
      @task-created="$emit('task-created', $event)"
      @show-message="$emit('show-message', $event)"
    />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useFileBasket } from "@/composables/file-system/useFileBasket.js";
import FileBasketPanel from "./FileBasketPanel.vue";
import {
  IconChevronDown,
  IconFolderPlus,
  IconGallery,
  IconGrid,
  IconList,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconShoppingCart,
  IconTaskList,
  IconUpload,
} from "@/components/icons";

const { t } = useI18n();

defineProps({
  currentPath: {
    type: String,
    required: true,
    default: "/",
  },
  isVirtual: {
    type: Boolean,
    default: false,
  },
  darkMode: {
    type: Boolean,
    default: false,
  },
  viewMode: {
    type: String,
    default: "list", // 'list' | 'grid' | 'gallery'
  },
});

const emit = defineEmits([
  "upload",
  "createFolder",
  "refresh",
  "changeViewMode",
  "openUploadModal",
  "openTasksModal",
  "openSearchModal",
  "openSettingsDrawer",
  "task-created",
  "show-message",
]);

const changeViewMode = (mode) => {
  emit("changeViewMode", mode);
};

// Actions dropdown
const showActionsMenu = ref(false);
const actionsMenuRef = ref(null);

const closeActionsMenu = () => {
  showActionsMenu.value = false;
};

const toggleActionsMenu = () => {
  showActionsMenu.value = !showActionsMenu.value;
};

const onDocumentClick = (event) => {
  if (!showActionsMenu.value) return;
  const el = actionsMenuRef.value;
  if (!el) return;
  if (el.contains(event.target)) return;
  closeActionsMenu();
};

onMounted(() => {
  document.addEventListener("click", onDocumentClick, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick, true);
});

// File basket
const { toggleBasket, isBasketOpen, closeBasket } = useFileBasket();

const handleActionUpload = () => {
  closeActionsMenu();
  emit("openUploadModal");
};

const handleActionCreateFolder = () => {
  closeActionsMenu();
  emit("createFolder");
};

const handleActionOpenBasket = () => {
  closeActionsMenu();
  toggleBasket();
};

const handleActionOpenTasks = () => {
  closeActionsMenu();
  emit("openTasksModal");
};
</script>
