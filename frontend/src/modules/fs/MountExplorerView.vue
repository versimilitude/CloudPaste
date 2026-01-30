<template>
  <div class="mount-explorer-container mx-auto px-3 sm:px-6 flex-1 flex flex-col pt-[15px] w-full max-w-none">

    <!-- æéç®¡çç»ä»¶ -->
    <PermissionManager
      :dark-mode="darkMode"
      permission-type="mount"
      :permission-required-text="$t('mount.permissionRequired')"
      :login-auth-text="$t('mount.loginAuth')"
      @permission-change="handlePermissionChange"
      @navigate-to-admin="navigateToAdmin"
    />

    <!-- ä¸»è¦åå®¹åºå -->
    <div v-if="hasPermission" class="mount-explorer-main">
      <!-- é¡¶é¨ READMEï¼ä»ç®å½è§å¾æ¾ç¤ºï¼?-->

      <!-- æä½æé® -->
      <div v-if="!showFilePreview" class="mount-toolbar flex items-center justify-between gap-3 mb-3">
        <BreadcrumbNav
          :current-path="currentViewPath"
          :dark-mode="darkMode"
          @navigate="handleNavigate"
          @prefetch="handlePrefetch"
          :basic-path="effectiveBasicPath"
          :user-type="isAdmin ? 'admin' : 'user'"
        />

        <div class="shrink-0">
          <FileOperations
            :current-path="currentPath"
            :is-virtual="isVirtualDirectory"
            :dark-mode="darkMode"
            :view-mode="viewMode"
            :selected-items="selectedItems"
            @create-folder="handleCreateFolder"
            @refresh="handleRefresh"
            @change-view-mode="handleViewModeChange"
            @openUploadModal="handleOpenUploadModal"
            @openCopyModal="handleBatchCopy"
            @openTasksModal="handleOpenTasksModal"
            @openSearchModal="handleOpenSearchModal"
            @openSettingsDrawer="handleOpenSettingsDrawer"
            @task-created="handleTaskCreated"
            @show-message="handleShowMessage"
          />
        </div>
      </div>

      <!-- ä¸ä¼ å¼¹çª -->
      <DirectoryReadme v-if="!showFilePreview" position="top" :meta="directoryMeta" :dark-mode="darkMode" />

      <UppyUploadModal
        v-if="hasEverOpenedUploadModal"
        :is-open="isUploadModalOpen"
        :current-path="currentPath"
        :dark-mode="darkMode"
        :is-admin="isAdmin"
        @close="handleCloseUploadModal"
        @upload-success="handleUploadSuccess"
        @upload-error="handleUploadError"
      />

      <!-- å¤å¶å¼¹çª -->
      <CopyModal
        v-if="hasEverOpenedCopyModal"
        :is-open="isCopyModalOpen"
        :dark-mode="darkMode"
        :selected-items="copyModalItems"
        :source-path="currentPath"
        :is-admin="isAdmin"
        :api-key-info="apiKeyInfo"
        @close="handleCloseCopyModal"
        @copy-started="handleCopyStarted"
      />

      <!-- ä»»å¡åè¡¨å¼¹çª -->
      <TaskListModal
        v-if="hasEverOpenedTasksModal"
        :is-open="isTasksModalOpen"
        :dark-mode="darkMode"
        @close="handleCloseTasksModal"
        @task-completed="handleTaskCompleted"
      />

      <!-- æ°å»ºæä»¶å¤¹å¼¹çª?-->
      <InputDialog
        :is-open="showCreateFolderDialog"
        :title="t('mount.operations.createFolder')"
        :description="t('mount.createFolder.enterName')"
        :label="t('mount.createFolder.folderName')"
        :placeholder="t('mount.createFolder.placeholder')"
        :validator="validateFsItemNameDialog"
        :confirm-text="t('mount.createFolder.create')"
        :cancel-text="t('mount.createFolder.cancel')"
        :loading="isCreatingFolder"
        :loading-text="t('mount.createFolder.creating')"
        :dark-mode="darkMode"
        @confirm="handleCreateFolderConfirm"
        @cancel="handleCreateFolderCancel"
        @close="showCreateFolderDialog = false"
      />

      <!-- å³é®èåéå½åå¼¹çª?-->
      <InputDialog
        :is-open="contextMenuRenameDialogOpen"
        :title="t('mount.rename.title')"
        :description="t('mount.rename.enterNewName')"
        :label="t('mount.rename.newName')"
        :initial-value="contextMenuRenameItem?.name || ''"
        :validator="validateFsItemNameDialog"
        :confirm-text="t('mount.rename.confirm')"
        :cancel-text="t('mount.rename.cancel')"
        :loading="isRenaming"
        :loading-text="t('mount.rename.renaming')"
        :dark-mode="darkMode"
        @confirm="handleContextMenuRenameConfirm"
        @cancel="handleContextMenuRenameCancel"
        @close="contextMenuRenameDialogOpen = false"
      />

      <!-- éç¨ ConfirmDialog ç»ä»¶æ¿æ¢åèå¯¹è¯æ¡?-->
      <ConfirmDialog
        :is-open="showDeleteDialog"
        :title="itemsToDelete.length === 1 ? t('mount.delete.title') : t('mount.batchDelete.title')"
        :confirm-text="itemsToDelete.length === 1 ? t('mount.delete.confirm') : t('mount.batchDelete.confirmButton')"
        :cancel-text="itemsToDelete.length === 1 ? t('mount.delete.cancel') : t('mount.batchDelete.cancelButton')"
        :loading="isDeleting"
        :loading-text="itemsToDelete.length === 1 ? t('mount.delete.deleting') : t('mount.batchDelete.deleting')"
        :dark-mode="darkMode"
        confirm-type="danger"
        @confirm="confirmDelete"
        @cancel="cancelDelete"
        @close="showDeleteDialog = false"
      >
        <template #content>
          <template v-if="itemsToDelete.length === 1">
            {{
              t("mount.delete.message", {
                type: itemsToDelete[0]?.isDirectory ? t("mount.fileTypes.folder") : t("mount.fileTypes.file"),
                name: itemsToDelete[0]?.name,
              })
            }}
            {{ itemsToDelete[0]?.isDirectory ? t("mount.delete.folderWarning") : "" }}
          </template>
          <template v-else>
            {{ t("mount.batchDelete.message", { count: itemsToDelete.length }) }}
            <div class="mt-2">
              <div class="text-xs font-medium mb-1">{{ t("mount.batchDelete.selectedItems") }}</div>
              <div class="max-h-32 overflow-y-auto bg-gray-50 dark:bg-gray-700 rounded p-2 text-xs">
                <div v-for="item in itemsToDelete.slice(0, 10)" :key="item.path" class="flex items-center py-0.5">
                  <span class="truncate">{{ item.name }}</span>
                  <span v-if="item.isDirectory" class="ml-1 text-gray-500">{{ t("mount.batchDelete.folder") }}</span>
                </div>
                <div v-if="itemsToDelete.length > 10" class="text-gray-500 py-0.5">
                  {{ t("mount.batchDelete.moreItems", { count: itemsToDelete.length - 10 }) }}
                </div>
              </div>
            </div>
          </template>
        </template>
      </ConfirmDialog>


      <!-- é¢åå±å¯¼è?-->


      <!-- åå®¹åºå - æ ¹æ®æ¨¡å¼æ¾ç¤ºæä»¶åè¡¨ææä»¶é¢è§?-->
      <div class="mount-content bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <Transition name="fade-slide" mode="out-in" @before-enter="handleContentBeforeEnter">
          <!-- æä»¶åè¡¨æ¨¡å¼ -->
          <div v-if="!showFilePreview" key="list" class="flex">
            <!-- ååµå¼å¯ç éªè¯?-->
            <DriveSidebar
              ref="driveSidebarRef"
              :root-path="effectiveBasicPath"
              :root-label="driveRootLabel"
              :current-path="currentViewPath"
              :dark-mode="darkMode"
              @navigate="handleNavigate"
              @prefetch="handlePrefetch"
            />

            <div class="flex-1 min-w-0 p-4">
              <PathPasswordDialog
              v-if="pathPassword.showPasswordDialog.value"
              :is-open="pathPassword.showPasswordDialog.value"
              :path="pathPassword.pendingPath.value || currentPath"
              :dark-mode="darkMode"
              :inline="true"
              @verified="handlePasswordVerified"
              @cancel="handlePasswordCancel"
              @close="handlePasswordClose"
              @error="handlePasswordError"
            />

            <template v-else>
              <!-- éé»å¡éè¯¯æç¤ºï¼ä¸åç?error ç´æ¥æ¿æ¢æ´ä¸ªåè¡¨åºå -->
              <div v-if="error" class="mb-4 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-start">
                    <IconXCircle size="md" class="w-5 h-5 text-red-500 mr-2 mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <div class="text-red-700 dark:text-red-200 font-medium">{{ $t("common.error") }}</div>
                      <div class="text-red-700/90 dark:text-red-200/90 text-sm mt-0.5">{{ error }}</div>
                      <div class="mt-3 flex flex-wrap gap-2">
                        <button
                          class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                          :class="darkMode ? 'bg-red-800/40 hover:bg-red-800/60 text-red-100' : 'bg-red-200 hover:bg-red-300 text-red-900'"
                          @click="handleRetryDirectory"
                        >
                          {{ $t("common.retry") }}
                        </button>
                        <button
                          class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                          :class="darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-100' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'"
                          @click="dismissDirectoryError"
                        >
                          {{ $t("common.close") }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ç®å½åè¡¨ -->
              <div class="min-h-[400px]">
                <DirectoryList
                  ref="directoryListRef"
                  :current-path="currentPath"
                  :items="visibleItems"
                  :loading="loading"
                  :has-more="directoryHasMore"
                  :loading-more="directoryLoadingMore"
                  :is-virtual="isVirtualDirectory"
                  :dark-mode="darkMode"
                  :view-mode="viewMode"
                  :show-checkboxes="explorerSettings.settings.showCheckboxes"
                  :selected-items="getSelectedItems()"
                  :context-highlight-path="contextHighlightPath"
                  :animations-enabled="explorerSettings.settings.animationsEnabled"
                  :file-name-overflow="explorerSettings.settings.fileNameOverflow"
                  :show-action-buttons="explorerSettings.settings.showActionButtons"
                  :rename-loading="isDirectoryListRenaming"
                  @navigate="handleNavigate"
                  @download="handleDownload"
                  @getLink="handleGetLink"
                  @rename="handleRename"
                  @delete="handleDelete"
                  @preview="handlePreview"
                  @load-more="handleLoadMore"
                  @item-select="handleItemSelect"
                  @toggle-select-all="toggleSelectAll"
                  @show-message="handleShowMessage"
                  @contextmenu="handleFileContextMenu"
                />
              </div>
            </template>
            </div>
          </div>

          <!-- æä»¶é¢è§æ¨¡å¼ -->
          <div v-else key="preview">
            <!-- é¢è§å è½½ç¶æ?-->
            <div v-if="isPreviewLoading" class="p-8 text-center">
              <LoadingIndicator
                :text="$t('common.loading')"
                :dark-mode="darkMode"
                size="xl"
                icon-class="text-blue-500"
              />
            </div>

            <!-- é¢è§éè¯¯ç¶æ?-->
            <div v-else-if="previewError" class="p-8 text-center">
              <div class="flex flex-col items-center space-y-4">
                <IconExclamation size="3xl" class="w-12 h-12 text-red-500" aria-hidden="true" />
                <div class="text-red-600 dark:text-red-400">
                  {{ previewError }}
                </div>
                <button @click="closePreviewWithUrl" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                  {{ $t("common.back") }}
                </button>
              </div>
            </div>

            <!-- é¢è§åå®¹ -->
            <div v-else-if="previewFile || previewInfo" class="p-4">
              <!-- è¿åæé® -->
              <div class="mb-4">
                <button
                  @click="closePreviewWithUrl"
                  class="inline-flex items-center px-3 py-1.5 rounded-md transition-colors text-sm font-medium"
                  :class="darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'"
                >
                  <IconBack size="sm" class="w-4 h-4 mr-1.5" aria-hidden="true" />
                  <span>{{ t("mount.backToFileList") }}</span>
                </button>
              </div>

              <!-- æä»¶é¢è§åå®¹ -->
              <FilePreview
                :file="previewInfo || previewFile"
                :dark-mode="darkMode"
                :is-loading="isPreviewLoading"
                :is-admin="isAdmin"
                :api-key-info="apiKeyInfo"
                :has-file-permission="hasFilePermission"
                :directory-items="visibleItems"
                @download="handleDownload"
                @loaded="handlePreviewLoaded"
                @error="handlePreviewError"
                @show-message="handleShowMessage"
              />
            </div>
          </div>
        </Transition>
      </div>

      <!-- åºé¨ README -->
      <DirectoryReadme v-if="!showFilePreview" position="bottom" :meta="directoryMeta" :dark-mode="darkMode" />
    </div>

    <!-- æç´¢å¼¹çª -->
    <SearchModal
      v-if="hasEverOpenedSearchModal"
      :is-open="isSearchModalOpen"
      :dark-mode="darkMode"
      :current-path="currentPath"
      :current-mount-id="currentMountId"
      @close="handleCloseSearchModal"
      @item-click="handleSearchItemClick"
    />

    <!-- è®¾ç½®æ½å± -->
    <SettingsDrawer
      v-if="hasEverOpenedSettingsDrawer"
      :is-open="isSettingsDrawerOpen"
      :dark-mode="darkMode"
      @close="handleCloseSettingsDrawer"
    />

    <!-- FS åªä½æ¥çå¨ï¼Lightbox Shellï¼?-->
    <FsMediaLightboxDialog v-if="hasEverOpenedLightbox" />

    <!-- æ¬æµ®æä½æ ?(å½æéä¸­é¡¹æ¶æ¾ç¤º) -->
    <FloatingActionBar
      v-if="hasPermission && selectedCount > 0"
      :selected-count="selectedCount"
      :dark-mode="darkMode"
      @download="handleBatchDownload"
      @copy-link="handleBatchGetLink"
      @copy="handleBatchCopy"
      @add-to-basket="handleBatchAddToBasket"
      @rename="handleBatchRename"
      @delete="batchDelete"
      @clear-selection="handleClearSelection"
    />

    <!-- æµ®å¨å·¥å·æ ?(å³ä¸è§å¿«æ·æä½? -->
    <FloatingToolbar
      v-if="hasPermission"
      :dark-mode="darkMode"
      :can-write="!isVirtualDirectory"
      :show-checkboxes="explorerSettings.showCheckboxes"
      @refresh="handleRefresh"
      @new-folder="handleCreateFolder"
      @upload="handleOpenUploadModal"
      @toggle-checkboxes="explorerSettings.toggleShowCheckboxes"
      @open-basket="handleOpenFileBasket"
      @open-tasks="handleOpenTasksModal"
      @settings="handleOpenSettingsDrawer"
    />

    <!-- è¿åé¡¶é¨æé® -->
    <BackToTop :dark-mode="darkMode" />
  </div>
</template>

<script setup>
import { ref, computed, provide, onMounted, onBeforeUnmount, watch, watchEffect, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import { storeToRefs } from "pinia";
import { useEventListener, useWindowScroll } from "@vueuse/core";
import { useThemeMode } from "@/composables/core/useThemeMode.js";
import { IconBack, IconExclamation, IconSearch, IconSettings, IconXCircle } from "@/components/icons";
import LoadingIndicator from "@/components/common/LoadingIndicator.vue";
import { useAuthStore } from "@/stores/authStore.js";

// ç»åå¼å½æ?- ä½¿ç¨ç»ä¸èåå¯¼åº
// æéä»å·ä½æä»¶å¯¼å?
import { useSelection } from "@/composables/ui-interaction/useSelection.js";
import { useUIState } from "@/composables/ui-interaction/useUIState.js";
import { useFileBasket } from "@/composables/file-system/useFileBasket.js";
import { useFileOperations } from "@/composables/file-system/useFileOperations.js";
import { usePathPassword } from "@/composables/usePathPassword.js";
import { useContextMenu } from "@/composables/useContextMenu.js";

// è§å¾æ§å¶å?
import { useMountExplorerController } from "./useMountExplorerController.js";

// å­ç»ä»?
import BreadcrumbNav from "@/modules/fs/components/shared/BreadcrumbNav.vue";
import DriveSidebar from "@/modules/fs/components/shared/DriveSidebar.vue";
import DirectoryList from "@/modules/fs/components/directory/DirectoryList.vue";
import DirectoryReadme from "@/modules/fs/components/DirectoryReadme.vue";
import FileOperations from "@/modules/fs/components/shared/FileOperations.vue";
// ï¼UppyãOfficeãEPUBãè§é¢æ­æ¾å¨ç­ï¼æéå è½½
const FilePreview = defineAsyncComponent(() => import("@/modules/fs/components/preview/FilePreview.vue"));
const UppyUploadModal = defineAsyncComponent(() => import("@/modules/fs/components/shared/modals/UppyUploadModal.vue"));
const CopyModal = defineAsyncComponent(() => import("@/modules/fs/components/shared/modals/CopyModal.vue"));
const TaskListModal = defineAsyncComponent(() => import("@/modules/fs/components/shared/modals/TaskListModal.vue"));
const SearchModal = defineAsyncComponent(() => import("@/modules/fs/components/shared/modals/SearchModal.vue"));
import PathPasswordDialog from "@/modules/fs/components/shared/modals/PathPasswordDialog.vue";
import ConfirmDialog from "@/components/common/dialogs/ConfirmDialog.vue";
import InputDialog from "@/components/common/dialogs/InputDialog.vue";
const FsMediaLightboxDialog = defineAsyncComponent(() => import("@/modules/fs/components/lightbox/FsMediaLightboxDialog.vue"));
import PermissionManager from "@/components/common/PermissionManager.vue";
const SettingsDrawer = defineAsyncComponent(() => import("@/modules/fs/components/shared/SettingsDrawer.vue"));
import FloatingActionBar from "@/modules/fs/components/shared/FloatingActionBar.vue";
import FloatingToolbar from "@/modules/fs/components/shared/FloatingToolbar.vue";
import BackToTop from "@/modules/fs/components/shared/BackToTop.vue";
import { useExplorerSettings } from "@/composables/useExplorerSettings";
import { createFsItemNameDialogValidator, isSameOrSubPath, normalizeFsPath, validateFsItemName } from "@/utils/fsPathUtils.js";
import { useFsMediaLightbox } from "@/modules/fs/composables/useFsMediaLightbox";
import { createLogger } from "@/utils/logger.js";

const { t } = useI18n();
const log = createLogger("MountExplorerView");

const validateFsItemNameDialog = createFsItemNameDialogValidator(t);

const authStore = useAuthStore();

// ä½¿ç¨ç»åå¼å½æ?
const selection = useSelection();
const fileOperations = useFileOperations();
const uiState = useUIState();
const fileBasket = useFileBasket();
const pathPassword = usePathPassword();

// å³é®èå - å»¶è¿åå§å?
let contextMenu = null;

// Lightboxï¼æ¨¡åååä¾ï¼?
const fsLightbox = useFsMediaLightbox();

// æä»¶ç¯®ç¶æ?
const { isBasketOpen } = storeToRefs(fileBasket);

// æ§å¶å¨ï¼å°è£è·¯ç± / æé / ç®å½å è½½ä¸é¢è§åå§å
const {
  currentPath,
  currentViewPath,
  loading,
  error,
  hasPermissionForCurrentPath,
  directoryItems,
  isVirtualDirectory,
  directoryMeta,
  directoryHasMore,
  directoryLoadingMore,
  isAdmin,
  hasApiKey,
  hasFilePermission,
  hasMountPermission,
  hasPermission,
  apiKeyInfo,
  currentMountId,
  previewFile,
  previewInfo,
  isPreviewLoading,
  previewError,
  showFilePreview,
  updateUrl,
  navigateTo,
  navigateToPreserveHistory,
  navigateToFile,
  stopPreview,
  refreshDirectory,
  refreshCurrentRoute,
  prefetchDirectory,
  consumePendingScrollRestore,
  invalidateCaches,
  removeItemsFromCurrentDirectory,
  loadMoreCurrentDirectory,
} = useMountExplorerController();

const { y: windowScrollY } = useWindowScroll();

const effectiveBasicPath = computed(() => {
  const apiKeyBasicPath = apiKeyInfo.value?.basic_path;
  if (apiKeyBasicPath) return apiKeyBasicPath;

  const userBasicPath = authStore.userInfo?.basicPath;
  if (userBasicPath) return userBasicPath;

  const orgId = authStore.ecoOrgId;
  return orgId ? `/drive/org/${orgId}` : "/";
});

const driveRootLabel = computed(() => authStore.ecoOrgName || authStore.userInfo?.name || "网盘");

// ===== ä»âç¬¬ä¸æ¬¡æå¼âæ¶æå è½½éå¼¹çªç»ä»¶ =====
const hasEverOpenedUploadModal = ref(false);
const hasEverOpenedCopyModal = ref(false);
const hasEverOpenedTasksModal = ref(false);
const hasEverOpenedSearchModal = ref(false);
const hasEverOpenedSettingsDrawer = ref(false);
const hasEverOpenedLightbox = ref(false);

const driveSidebarRef = ref(null);

const scheduleWindowScrollTo = (top) => {
  if (typeof window === "undefined") return;
  // ç­åè¡?DOM æå¥å¹¶å®æä¸æ¬¡å¸å±ååæ»å¨
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      windowScrollY.value = top;
    });
    return;
  }
  // éçº§ï¼æç«¯ç¯å¢æ  rAF
  setTimeout(() => {
    windowScrollY.value = top;
  }, 0);
};

// è§£å³ä½ è¯´çâåä¸âå°é¡¶âåä¸âæå¨ï¼ææ»å¨è®¾ç½®ç»ä¸æ¶å£å?Transition çè¿å¥é¶æ®µï¼åªæ§è¡ä¸æ¬?
const handleContentBeforeEnter = () => {
  // è¿å¥é¢è§ï¼é»è®¤åå°é¡¶é?
  if (showFilePreview.value) {
    scheduleWindowScrollTo(0);
    return;
  }

  // åå°åè¡¨ï¼å¦æ?controller æâå¾æ¢å¤çæ»å¨å¼âï¼å¨åè¡¨çæ­£è¿å¥ååè®¾ç½®å¥½
  if (typeof consumePendingScrollRestore === "function") {
    const value = consumePendingScrollRestore();
    if (typeof value === "number") {
      scheduleWindowScrollTo(value);
    }
  }
};

// æ ¹æ®ç®å½ Meta çéèè§åè®¡ç®å®éå¯è§æ¡ç?
const visibleItems = computed(() => {
  const items = directoryItems.value || [];
  const meta = directoryMeta.value;
  const patterns = meta && Array.isArray(meta.hidePatterns) ? meta.hidePatterns : [];

  if (!patterns.length) {
    return items;
  }

  const regexes = patterns
    .map((pattern) => {
      try {
        return new RegExp(pattern);
      } catch {
        return null;
      }
    })
    .filter((re) => re);

  if (!regexes.length) {
    return items;
  }

  return items.filter((item) => !regexes.some((re) => re.test(item.name)));
});

const { selectedItems, selectedCount, setAvailableItems, toggleSelectAll, getSelectedItems, selectItem, clearSelection } = selection;

// ç»åå¼å½æ°ç¶æåæ¹æ³
const {
  // æ¶æ¯ç®¡ç
  showMessage,
  // å¼¹çªç¶æç®¡ç?
  isUploadModalOpen,
  isCopyModalOpen,
  isTasksModalOpen,
  isSearchModalOpen,

  openUploadModal,
  closeUploadModal,
  openCopyModal,
  closeCopyModal,
  openTasksModal,
  closeTasksModal,
  openSearchModal,
  closeSearchModal,
} = uiState;

const showDeleteDialog = ref(false);
const itemsToDelete = ref([]);
const isDeleting = ref(false);

// å³é®èåç¸å³ç¶æ?
const contextMenuRenameItem = ref(null);
const contextMenuRenameDialogOpen = ref(false);
const isRenaming = ref(false); // éå½åæä½ç loading ç¶æ?
const contextMenuCopyItems = ref([]);
// å³é®èåé«äº®çé¡¹ç®è·¯å¾ï¼ä¸´æ¶é«äº®ï¼ä¸æ¯å¾ééä¸­ï¼?
const contextHighlightPath = ref(null);
// DirectoryList ç»ä»¶å¼ç¨
const directoryListRef = ref(null);
// DirectoryList éå½åæä½ç loading ç¶æ?
const isDirectoryListRenaming = ref(false);

// æ°å»ºæä»¶å¤¹å¼¹çªç¶æ?
const showCreateFolderDialog = ref(false);
const isCreatingFolder = ref(false);

// è®¾ç½®æ½å±ç¶æ?
const isSettingsDrawerOpen = ref(false);

// ===== ä»âç¬¬ä¸æ¬¡æå¼âæ¶æå è½½éå¼¹çªç»ä»¶ï¼watch éè¦å¨ä¾èµåéå®ä¹ä¹åæ³¨åï¼?=====
watch(
  () => isUploadModalOpen.value,
  (open) => {
    if (open) hasEverOpenedUploadModal.value = true;
  }
);
watch(
  () => isCopyModalOpen.value,
  (open) => {
    if (open) hasEverOpenedCopyModal.value = true;
  }
);
watch(
  () => isTasksModalOpen.value,
  (open) => {
    if (open) hasEverOpenedTasksModal.value = true;
  }
);
watch(
  () => isSearchModalOpen.value,
  (open) => {
    if (open) hasEverOpenedSearchModal.value = true;
  }
);
watch(
  () => isSettingsDrawerOpen.value,
  (open) => {
    if (open) hasEverOpenedSettingsDrawer.value = true;
  }
);
watch(
  () => fsLightbox.isOpen.value,
  (open) => {
    if (open) hasEverOpenedLightbox.value = true;
  }
);

// åå§åç¨æ·éç½?
const explorerSettings = useExplorerSettings();

// ä»?explorerSettings è·åè§å¾æ¨¡å¼
const viewMode = computed(() => explorerSettings.settings.viewMode);
const setViewMode = (mode) => explorerSettings.setViewMode(mode);

// å¤å¶å¼¹çªä½¿ç¨çé¡¹ç®åè¡¨ï¼ä¼åä½¿ç¨å³é®èåéä¸­çé¡¹ç®ï¼å¦åä½¿ç¨å¾éçé¡¹ç®
const copyModalItems = computed(() => {
  if (contextMenuCopyItems.value.length > 0) {
    return contextMenuCopyItems.value;
  }
  return getSelectedItems();
});

// åå§åå³é®èå?
const initContextMenu = () => {
  contextMenu = useContextMenu({
    onDownload: handleDownload,
    onGetLink: handleGetLink,
    onAddToQuickAccess: (itemsOrItem) => {
      const itemsArray = Array.isArray(itemsOrItem) ? itemsOrItem : [itemsOrItem];
      itemsArray.forEach((it) => {
        if (!it) return;
        const rawPath = typeof it.path === "string" ? it.path : "";
        if (!rawPath) return;

        const normalized = normalizeFsPath(rawPath);
        const targetPath = it.isDirectory
          ? normalized
          : normalizeFsPath(normalized.split("/").slice(0, -1).join("/") || "/");

        const name = targetPath.split("/").filter(Boolean).slice(-1)[0] || targetPath;
        driveSidebarRef.value?.addQuickAccess(targetPath, name);
      });
    },
    onRename: (item) => {
      // ç´æ¥è§¦åéå½åï¼è®¾ç½®å¾éå½åçé¡¹ç?
      contextMenuRenameItem.value = item;
      contextMenuRenameDialogOpen.value = true;
    },
    onDelete: (items) => {
      if (Array.isArray(items)) {
        itemsToDelete.value = items;
      } else {
        itemsToDelete.value = [items];
      }
      showDeleteDialog.value = true;
    },
    onCopy: (items) => {
      // å³é®èåå¤å¶ï¼ç´æ¥ä½¿ç¨ä¼ å¥çé¡¹ç®ï¼èä¸æ¯ä¾èµ?selectedItems
      const itemsArray = Array.isArray(items) ? items : [items];
      if (itemsArray.length === 0) {
        showMessage("warning", t("mount.messages.noItemsSelected"));
        return;
      }
      // ä¸´æ¶è®¾ç½®éä¸­é¡¹ç®ä»¥ä¾¿å¤å¶å¼¹çªä½¿ç¨
      contextMenuCopyItems.value = itemsArray;
      openCopyModal();
    },
    onAddToBasket: (items) => {
      const itemsArray = Array.isArray(items) ? items : [items];
      const result = fileBasket.addSelectedToBasket(itemsArray, currentPath.value);
      if (result.success) {
        showMessage("success", result.message);
      } else {
        showMessage("error", result.message);
      }
    },
    onToggleCheckboxes: () => {
      // åæ¢å¾éæ¡æ¾ç¤ºç¶æ?
      explorerSettings.toggleShowCheckboxes();
    },
    t,
  });
};

onMounted(() => {
  explorerSettings.loadSettings();
  explorerSettings.setupDarkModeObserver();
  initContextMenu();
});

watchEffect(
  () => {
    const path = currentViewPath.value;
    const items = visibleItems.value || [];

    // Track directory changes so the tree stays in sync with Mount Explorer updates
    const dirPaths = [];
    for (const it of items) {
      if (it?.isDirectory && typeof it.path === "string") {
        dirPaths.push(it.path);
      }
    }
    void dirPaths.length;

    driveSidebarRef.value?.syncFromDirectoryList(path, items);
  },
  { flush: "post" }
);

const props = defineProps({
  mode: {
    type: String,
    default: "default", // é»è®¤æ¨¡å¼ï¼æ "selection"ï¼éæ©æ¨¡å¼ï¼?
  },
});

const { isDarkMode: darkMode } = useThemeMode();

// æéååå¤ç
const handlePermissionChange = (hasPermission) => {
  // æéç¶æä¼èªå¨æ´æ°ï¼è¿éåªéè¦è®°å½æ¥å¿?
};

// APIå¯é¥ä¿¡æ¯
// å¯¼èªå°ç®¡çé¡µé?
const navigateToAdmin = () => {
  import("@/router").then(({ routerUtils }) => {
    routerUtils.navigateTo("admin");
  });
};

// æç´¢ç¸å³äºä»¶å¤ç
const handleOpenSearchModal = () => {
  openSearchModal();
};

// è®¾ç½®æ½å±äºä»¶å¤ç
const handleOpenSettingsDrawer = () => {
  isSettingsDrawerOpen.value = true;
};

const handleCloseSettingsDrawer = () => {
  isSettingsDrawerOpen.value = false;
};

// æå¼æä»¶ç¯?
const handleOpenFileBasket = () => {
  fileBasket.toggleBasket();
};

// æ¬æµ®æä½æ äºä»¶å¤ç?
const handleBatchDownload = async () => {
  const selectedFiles = getSelectedItems();
  for (const item of selectedFiles) {
    if (!item.isDirectory) {
      await handleDownload(item);
    }
  }
};

const handleBatchGetLink = async () => {
  const selectedFiles = getSelectedItems();
  if (selectedFiles.length === 1 && !selectedFiles[0].isDirectory) {
    await handleGetLink(selectedFiles[0]);
  }
};

const handleBatchRename = () => {
  const selectedFiles = getSelectedItems();
  if (selectedFiles.length === 1) {
    // ç´æ¥æå¼éå½åå¯¹è¯æ¡
    contextMenuRenameItem.value = selectedFiles[0];
    contextMenuRenameDialogOpen.value = true;
  }
};

const handleClearSelection = () => {
  clearSelection();
};

const handleCloseSearchModal = () => {
  closeSearchModal();
};

// å¤çæç´¢ç»æé¡¹ç¹å?
const handleSearchItemClick = async (item) => {
  try {
    if (!item.isDirectory) {
      await navigateToFile(item.path);
    } else {
      await navigateTo(item.path);
    }

    // å³é­æç´¢æ¨¡ææ¡
    closeSearchModal();
  } catch (error) {
    log.error("æç´¢ç»æå¯¼èªå¤±è´¥:", error);    showMessage("error", "???????????");
  }
};

// ===== MountExplorerMainçæææ¹æ³?=====

/**
 * å¤çå¯¼èª
 */
const handleNavigate = async (path) => {
  // é¢åå±?è¿åä¸çº§å±äºâåéå¯¼èªâï¼
  // - ä¼åä¿çç®æ ç®å½ç?history å¿«ç§
  if (isSameOrSubPath(path, currentViewPath.value)) {
    await navigateToPreserveHistory(path);
    return;
  }

  await navigateTo(path);
};

const handlePrefetch = (path) => {
  prefetchDirectory(path);
};

/**
 * å¤çå·æ°
 */
const handleRefresh = async () => {
  await refreshDirectory();
};

/**
 * å¤çâå è½½æ´å¤âï¼ç¨äºä¸æ¸¸åé¡µçç®å½ï¼
 */
const handleLoadMore = async () => {
  await loadMoreCurrentDirectory();
};

/**
 * å¤çè§å¾æ¨¡å¼åå
 */
const handleViewModeChange = (newViewMode) => {
  setViewMode(newViewMode);
  // è§å¾æ¨¡å¼å·²éè¿ useExplorerSettings èªå¨ä¿å­å?localStorage
};

/**
 * å¤çæä»¶å¤¹åå»?- æå¼å¼¹çª
 */
const handleCreateFolder = () => {
  showCreateFolderDialog.value = true;
};

/**
 * å¤çæ°å»ºæä»¶å¤¹ç¡®è®?
 */
const handleCreateFolderConfirm = async (folderName) => {
  if (!folderName) return;

  isCreatingFolder.value = true;
  try {
    // ä½¿ç¨fileOperationsåå»ºæä»¶å¤¹ï¼ä¼ éæ­£ç¡®çåæ°
    const result = await fileOperations.createFolder(currentPath.value, folderName);

    if (result.success) {
      showMessage("success", result.message);
      invalidateCaches();
      // éæ°å è½½å½åç®å½åå®¹
      await refreshDirectory();
      showCreateFolderDialog.value = false;
    } else {
      showMessage("error", result.message);
    }
  } catch (error) {
    log.error("åå»ºæä»¶å¤¹å¤±è´?", error);
    showMessage("error", "\u521b\u5efa\u6587\u4ef6\u5939\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5");
  } finally {
    isCreatingFolder.value = false;
  }
};

/**
 * å¤çæ°å»ºæä»¶å¤¹åæ¶?
 */
const handleCreateFolderCancel = () => {
  showCreateFolderDialog.value = false;
};

/**
 * å¤çå³é®èåéå½åç¡®è®?
 */
const handleContextMenuRenameConfirm = async (newName) => {
  if (!contextMenuRenameItem.value || !newName || !newName.trim()) return;

  const nameValidation = validateFsItemName(newName);
  if (!nameValidation.valid) return;

  // è®¾ç½® loading ç¶æ?
  isRenaming.value = true;

  try {
    const item = contextMenuRenameItem.value;
    const isDirectory = item.isDirectory;
    const oldPath = item.path;
    const basePath = isDirectory && oldPath.endsWith("/") ? oldPath.slice(0, -1) : oldPath;
    const parentPath = basePath.substring(0, basePath.lastIndexOf("/") + 1);
    let newPath = parentPath + newName.trim();

    // ç®å½å¨åç«¯å¥çº¦ä¸­ä»ä»¥ `/` ç»å°¾
    if (isDirectory) {
      newPath += "/";
    }

    // ä½¿ç¨ fileOperations éå½å?
    const result = await fileOperations.renameItem(oldPath, newPath);

    if (result.success) {
      showMessage("success", result.message);
      invalidateCaches();
      // éæ°å è½½å½åç®å½åå®¹
      await refreshDirectory();
      // å³é­å¯¹è¯æ¡å¹¶æ¸çç¶æ?
      contextMenuRenameDialogOpen.value = false;
      contextMenuRenameItem.value = null;
    } else {
      showMessage("error", result.message);
    }
  } catch (error) {
    log.error("éå½åå¤±è´?", error);
    showMessage("error", error.message || t("mount.rename.failed"));
  } finally {
    isRenaming.value = false;
  }
};

/**
 * å¤çå³é®èåéå½ååæ¶?
 */
const handleContextMenuRenameCancel = () => {
  contextMenuRenameDialogOpen.value = false;
  contextMenuRenameItem.value = null;
};

/**
 * å³é­æä»¶ç¯®é¢æ?
 */
const closeBasket = () => {
  try {
    fileBasket.closeBasket();
  } catch (error) {
    log.error("å³é­æä»¶ç¯®é¢æ¿å¤±è´?", error);
  }
};

/**
 * å¤çæä»¶ä¸è½½
 */
const handleDownload = async (item) => {
  const result = await fileOperations.downloadFile(item);

  if (result.success) {
    showMessage("success", result.message);
  } else {
    showMessage("error", result.message);
  }
};

/**
 * å¤çè·åæä»¶é¾æ¥
 */
const handleGetLink = async (item) => {
  const result = await fileOperations.getFileLink(item);

  if (result.success) {
    showMessage("success", result.message);
  } else {
    showMessage("error", result.message);
  }
};

/**
 * å¤çæä»¶é¢è§
 */
const handlePreview = async (item) => {
  if (!item || item.isDirectory) return;

  // ç´æ¥å¯¼èªå°æä»¶è·¯å¾ï¼pathname è¡¨ç¤ºå¯¹è±¡ï¼?
  await navigateToFile(item.path);
};

/**
 * å¤çæä»¶å é¤ï¼æ¾ç¤ºç¡®è®¤å¯¹è¯æ¡ï¼?
 */
const handleDelete = (item) => {
  itemsToDelete.value = [item];
  showDeleteDialog.value = true;
};

/**
 * å¤çæä»¶éå½å?
 */
const handleRename = async ({ item, newName }) => {
  if (!item || !newName || !newName.trim()) return;

  const nameValidation = validateFsItemName(newName);
  if (!nameValidation.valid) return;

  // è®¾ç½® loading ç¶æï¼ç¨äº DirectoryList åé¨çéå½åå¯¹è¯æ¡ï¼
  isDirectoryListRenaming.value = true;

  try {
    // æå»ºæ°è·¯å¾?
    const isDirectory = item.isDirectory;
    const oldPath = item.path;
    const basePath = isDirectory && oldPath.endsWith("/") ? oldPath.slice(0, -1) : oldPath;
    const parentPath = basePath.substring(0, basePath.lastIndexOf("/") + 1);
    let newPath = parentPath + newName.trim();

    // ç®å½å¨åç«¯å¥çº¦ä¸­ä»ä»¥ `/` ç»å°¾
    if (isDirectory) {
      newPath += "/";
    }

    // ä½¿ç¨fileOperationséå½å?
    const result = await fileOperations.renameItem(oldPath, newPath);

    if (result.success) {
      showMessage("success", result.message);
      invalidateCaches();
      // éæ°å è½½å½åç®å½åå®¹
      await refreshDirectory();
    } else {
      showMessage("error", result.message);
    }
  } catch (error) {
    showMessage("error", error.message || t("mount.rename.failed"));
  } finally {
    isDirectoryListRenaming.value = false;
    // å³é­ DirectoryList çéå½åå¯¹è¯æ¡?
    directoryListRef.value?.closeRenameDialog();
  }
};

/**
 * å¤çé¡¹ç®éæ©
 */
const handleItemSelect = (item, selected) => {
  selectItem(item, selected);
};

// handleItemDeleteæ¹æ³å¨åå§æä»¶ä¸­ä¸å­å¨ï¼å·²å é¤ï¼ä½¿ç¨handleDeleteä»£æ¿ï¼?

/**
 * å¤çæ¹éå é¤
 */
const batchDelete = () => {
  const selectedFiles = getSelectedItems();

  if (selectedFiles.length === 0) {
    showMessage("warning", t("mount.messages.noItemsSelected"));
    return;
  }

  itemsToDelete.value = selectedFiles;
  showDeleteDialog.value = true;
};

/**
 * åæ¶å é¤
 */
const cancelDelete = () => {
  // å é¤è¿ç¨ä¸­ä¸åè®¸åæ¶
  if (isDeleting.value) return;

  // æ¸çå é¤ç¶æ?
  itemsToDelete.value = [];
};

/**
 * ç¡®è®¤å é¤
 */
const confirmDelete = async () => {
  if (itemsToDelete.value.length === 0 || isDeleting.value) return;

  isDeleting.value = true;

  try {
    // ä½¿ç¨fileOperationså é¤é¡¹ç®
    const result = await fileOperations.batchDeleteItems(itemsToDelete.value);

    if (result.success) {
      showMessage("success", result.message);

      // å é¤å±äºåæä½ï¼æ¸ç©ºåç«¯ç¼å­ï¼ç§å¼å¿«ç§ + å¯éªè¯ç¼å­ï¼ï¼å¼ºå¶ä¸ä¸æ¬¡å¯¼èªä»¥æå¡ç«¯ä¸ºå?
      invalidateCaches();
      // ç«å³ä»å½åç®å½ç§»é¤ï¼åå°ç­å¾ä¸éªçï¼
      removeItemsFromCurrentDirectory(itemsToDelete.value.map((item) => item?.path).filter(Boolean));

      // å¦ææ¯æ¹éå é¤ï¼æ¸ç©ºéæ©ç¶æ?
      if (itemsToDelete.value.length > 1) {
        clearSelection();
      }

      // å³é­å¯¹è¯æ¡?
      showDeleteDialog.value = false;
      itemsToDelete.value = [];

      // éæ°å è½½å½åç®å½åå®¹
      await refreshDirectory();
    } else {
      showMessage("error", result.message);
    }
  } catch (error) {
    log.error("å é¤æä½å¤±è´¥:", error);
    showMessage("error", error.message || t("mount.messages.deleteFailed", { message: t("common.unknown") }));
  } finally {
    isDeleting.value = false;
  }
};

// è¿äºæ¹æ³å¨åå§MountExplorerMain.vueä¸­ä¸å­å¨ï¼å·²å é¤

const handleBatchAddToBasket = () => {
  try {
    const selectedFiles = getSelectedItems();
    const result = fileBasket.addSelectedToBasket(selectedFiles, currentPath.value);

    if (result.success) {
      showMessage("success", result.message);
      // å¯éï¼å³é­å¾éæ¨¡å¼?
      // toggleCheckboxMode(false);
    } else {
      showMessage("error", result.message);
    }
  } catch (error) {
    log.error("æ¹éæ·»å å°æä»¶ç¯®å¤±è´¥:", error);
    showMessage("error", t("fileBasket.messages.batchAddFailed"));
  }
};

// å¼¹çªç¸å³æ¹æ³
const handleOpenUploadModal = () => {
  openUploadModal();
};

const handleCloseUploadModal = () => {
  closeUploadModal();
};

const handleUploadSuccess = async (payload) => {
  const count = Number(payload?.count || 0);
  const skippedUploadCount = Number(payload?.skippedUploadCount || 0);

  if (skippedUploadCount > 0) {
    showMessage("success", t("mount.messages.uploadSuccessWithSkipped", { count, skipped: skippedUploadCount }));
  } else if (count > 1) {
    // å¼å®¹ï¼å¤æä»¶æ¶ç»æ´æç¡®çæç¤º
    showMessage("success", t("mount.messages.uploadSuccessWithCount", { count }));
  } else {
    showMessage("success", t("mount.messages.uploadSuccess"));
  }
  invalidateCaches();
  await refreshDirectory();
};

const handleUploadError = (error) => {
  log.error("ä¸ä¼ å¤±è´¥:", error);
  showMessage("error", error.message || t("mount.messages.uploadFailed"));
};

const handleBatchCopy = () => {
  if (selectedItems.value.length === 0) {
    showMessage("warning", t("mount.messages.noItemsSelected"));
    return;
  }
  openCopyModal();
};

const handleCloseCopyModal = () => {
  closeCopyModal();
  // æ¸çå³é®èåå¤å¶é¡¹ç®
  contextMenuCopyItems.value = [];
};

const handleCopyStarted = (event) => {
  // æ¾ç¤ºå¤å¶å¼å§æ¶æ?
  const message =
    event?.message ||
    t("mount.taskManager.copyStarted", {
      count: event?.itemCount || 0,
      path: event?.targetPath || "",
    });
  showMessage("success", message);
  clearSelection();
};

const handleOpenTasksModal = () => {
  openTasksModal();
};

const handleCloseTasksModal = () => {
  closeTasksModal();
};

/**
 * å¤çä»»å¡å®æäºä»¶ - èªå¨å·æ°å½åç®å½
 */
const handleTaskCompleted = async (event) => {
  // å»¶è¿ä¸å°æ®µæ¶é´åå·æ°ï¼ç¡®ä¿åç«¯æ°æ®å·²åæ­?
  setTimeout(async () => {
    try {
      invalidateCaches();
      await refreshDirectory();
      showMessage('success', t('mount.taskManager.taskCompletedRefresh'));
    } catch (error) {
      log.error('[MountExplorer] å·æ°ç®å½å¤±è´¥:', error);
    }
  }, 500);
};

/**
 * å¤çä»»å¡åå»ºäºä»¶
 */
const handleTaskCreated = (taskInfo) => {
  // å¯ä»¥å¨è¿éæ·»å é¢å¤çä»»å¡è·è¸ªé»è¾
  // ä¾å¦ï¼æå¼ä»»å¡ç®¡çå¨é¢æ?
  // openTasksModal();
};

const handleShowMessage = (messageInfo) => {
  showMessage(messageInfo.type, messageInfo.message);
};

// ç¨äºå­å¨æ¸é¤é«äº®çå½æ°å¼ç¨ï¼ä»¥ä¾¿å¨ä¸æ¬¡å³é®æ¶åç§»é¤æ§çå¬å?
let clearHighlightHandler = null;
let stopClearHighlightListener = null;

// å¤çå³é®èåäºä»¶
// 1. åæä»¶å³é®ï¼åªä¸´æ¶é«äº®æ¾ç¤ºå½åæä»?
// 2. æéä¸­é¡¹æ¶å³é®ï¼æä½å·²éä¸­çé¡¹ç?
const handleFileContextMenu = (payload) => {
  if (!contextMenu) return;
  const { event, item, action } = payload;

  // å¤çç¹æ®æä½ï¼ä¸éè¦?item çæä½ï¼
  if (action) {
    switch (action) {
      case 'copy':
        // å¤å¶æä½ï¼ä½¿ç?payload.items
        if (payload.items && payload.items.length > 0) {
          contextMenuCopyItems.value = payload.items;
          openCopyModal();
        }
        return;
      
      case 'add-to-basket':
        // æ·»å å°æä»¶ç¯®æä½ï¼ä½¿ç?payload.items
        if (payload.items && payload.items.length > 0) {
          const result = fileBasket.addSelectedToBasket(payload.items, currentPath.value);
          if (result.success) {
            showMessage("success", result.message);
          } else {
            showMessage("error", result.message);
          }
        }
        return;
      
      case 'toggle-checkboxes':
        // åæ¢å¾éæ¡æ¾ç¤º
        explorerSettings.toggleShowCheckboxes();
        return;
    }
  }

  // å¸¸è§å³é®èåå¤çï¼éè¦?itemï¼?
  if (!item) return;

  // åç§»é¤ä¹åççå¬å¨ï¼å¦æå­å¨ï¼?
  if (typeof stopClearHighlightListener === "function") {
    stopClearHighlightListener();
    stopClearHighlightListener = null;
  }
  clearHighlightHandler = null;

  // è·åå½åå·²éä¸­çé¡¹ç?
  const selectedFiles = getSelectedItems();
  const isItemSelected = selectedFiles.some((i) => i.path === item.path);

  let itemsForMenu;

  if (selectedFiles.length > 0) {
    // æéä¸­é¡¹æ¶ï¼?
    // - å¦æå³é®çé¡¹ç®å·²å¨éä¸­åè¡¨ä¸­ï¼æä½ææéä¸­é¡¹ç®
    // - å¦æå³é®çé¡¹ç®ä¸å¨éä¸­åè¡¨ä¸­ï¼åªæä½å½åé¡¹ç®ï¼ä¸æ¹åéä¸­ç¶æï¼
    if (isItemSelected) {
      itemsForMenu = selectedFiles;
      // å·²éä¸­çé¡¹ç®ä¸éè¦ä¸´æ¶é«äº?
      contextHighlightPath.value = null;
    } else {
      itemsForMenu = [item];
      // è®¾ç½®ä¸´æ¶é«äº®
      contextHighlightPath.value = item.path;
    }
  } else {
    // æ éä¸­é¡¹ï¼åªæä½å½åå³é®çé¡¹ç®ï¼è®¾ç½®ä¸´æ¶é«äº?
    itemsForMenu = [item];
    contextHighlightPath.value = item.path;
  }

  // æ¾ç¤ºå³é®èåï¼ä¼ éå½åå¾éæ¡æ¾ç¤ºç¶æï¼
  contextMenu.showContextMenu(event, item, itemsForMenu, darkMode.value, explorerSettings.settings.showCheckboxes);

  // åå»ºæ¸é¤é«äº®çå¤çå½æ?
  // åªçå?click äºä»¶ï¼å·¦é®ç¹å»å³é­èåæ¶æ¸é¤é«äº®ï¼?
  // ä¸çå?contextmenu äºä»¶ï¼å ä¸ºä¸æ¬¡å³é®ä¼ç´æ¥è®¾ç½®æ°çé«äº®
  clearHighlightHandler = () => {
    contextHighlightPath.value = null;
    if (typeof stopClearHighlightListener === "function") {
      stopClearHighlightListener();
      stopClearHighlightListener = null;
    }
  };

  // å»¶è¿æ·»å çå¬å¨ï¼é¿åå½åäºä»¶ç«å³è§¦å
  // ä½¿ç¨ ref å­å¨ timeout ID ä»¥ä¾¿å¨ç»ä»¶å¸è½½æ¶æ¸ç
  const timeoutId = setTimeout(() => {
    if (clearHighlightHandler) {
      stopClearHighlightListener = useEventListener(document, "click", clearHighlightHandler, { once: true });
    }
  }, 50);
};

// å¯ç éªè¯äºä»¶å¤ç
const handlePasswordVerified = ({ path, token, message }) => {
  // ä¿å­éªè¯ token
  pathPassword.savePathToken(path, token);

  // æ¾ç¤ºæåæ¶æ¯
  showMessage("success", message || t("mount.pathPassword.verified"));

  // å³é­å¼¹çª
  pathPassword.closePasswordDialog();
  pathPassword.clearPendingPath();

  // éæ°å è½½å½åè·¯ç±ï¼å¯è½æ¯ç®å½ï¼ä¹å¯è½æ¯æä»¶æ·±é¾ï¼
  refreshCurrentRoute();
};

const handlePasswordCancel = async () => {
  // å³é­å¯ç å¼¹çª
  pathPassword.closePasswordDialog();
  pathPassword.clearPendingPath();

  // è®¡ç®ç¶ç®å½è·¯å¾?
  const currentPathValue = currentPath.value;
  let parentPath = "/";

  if (currentPathValue && currentPathValue !== "/") {
    // ç§»é¤æ«å°¾çææ ï¼å¦ææï¼
    const normalized = currentPathValue.replace(/\/+$/, "");
    // è·åæåä¸ä¸ªææ ä¹åçé¨å
    const lastSlashIndex = normalized.lastIndexOf("/");
    if (lastSlashIndex > 0) {
      parentPath = normalized.substring(0, lastSlashIndex);
    }
  }

  // å¯¼èªå°ç¶ç®å½
  await navigateTo(parentPath);
};

const handlePasswordClose = () => {
  pathPassword.closePasswordDialog();
};

const handlePasswordError = ({ message }) => {
  log.error("å¯ç éªè¯éè¯¯:", message);
  showMessage("error", message);
};

// é¢è§ç¸å³æ¹æ³
let lastPreviewLoadedKey = "";
const handlePreviewLoaded = () => {
  // é¿ååä¸ä¸ªæä»¶å¨åªä½äºä»¶éå¤è§¦åæ¶å·å±?
  const f = previewInfo.value || previewFile.value;
  const key = f?.path || f?.name || "";
  if (key && key === lastPreviewLoadedKey) return;
  lastPreviewLoadedKey = key;
};

const handlePreviewError = (error) => {
  log.error("é¢è§å è½½å¤±è´¥:", error);
  showMessage("error", t("mount.messages.previewError"));
};

const closePreviewWithUrl = async () => {
  await navigateToPreserveHistory(currentPath.value);
};

const handleRetryDirectory = async () => {
  // æ¸æå½åéè¯¯
  error.value = null;
  await refreshDirectory();
};

const dismissDirectoryError = () => {
  error.value = null;
};

// é¢è§ç¸å³äºä»¶å¤çå·²å¨ä¸é¢å®ä¹

// æä¾æ°æ®ç»å­ç»ä»¶
provide("darkMode", darkMode);
provide("isAdmin", isAdmin);
provide("apiKeyInfo", apiKeyInfo);
provide("hasPermissionForCurrentPath", hasPermissionForCurrentPath);
provide("navigateToFile", navigateToFile);

// å¤çè®¤è¯ç¶æåå?
const handleAuthStateChange = (event) => {
  // æéç¶æä¼èªå¨æ´æ°ï¼è¿éåªéè¦è®°å½æ¥å¿?
};

// å¨å±å¿«æ·é®å¤ç?
const handleGlobalKeydown = (event) => {
  // Ctrl+K æå¼æç´¢
  if ((event.ctrlKey || event.metaKey) && event.key === "k") {
    event.preventDefault();
    if (hasPermission.value && !isSearchModalOpen.value) {
      handleOpenSearchModal();
    }
  }

  // ESC å³é­æç´¢
  if (event.key === "Escape" && isSearchModalOpen.value) {
    handleCloseSearchModal();
  }
};

// æ³¨åå¨å±äºä»¶ï¼èªå¨æ¸çï¼
useEventListener(window, "auth-state-changed", handleAuthStateChange);
useEventListener(document, "keydown", handleGlobalKeydown);

// çå¬ç®å½é¡¹ç®ååï¼æ´æ°éæ©ç¶æï¼ä»éå¯¹å¯è§æ¡ç®ï¼
watch(
  () => visibleItems.value,
  (newItems) => {
    setAvailableItems(newItems);
  },
  { immediate: true }
);

// çå¬è·¯å¾ååï¼èªå¨å³é­å¯ç å¼¹çª?
watch(
  () => currentPath.value,
  (newPath, oldPath) => {
    if (newPath !== oldPath && pathPassword.showPasswordDialog.value) {
      pathPassword.closePasswordDialog();
      pathPassword.clearPendingPath();
    }
  }
);

// ç»ä»¶å¸è½½æ¶æ¸çèµæº?
onBeforeUnmount(() => {
  // æ¸ç clearHighlightHandler äºä»¶çå¬å?
  if (typeof stopClearHighlightListener === "function") {
    stopClearHighlightListener();
    stopClearHighlightListener = null;
  }
  clearHighlightHandler = null;

  // æ¸ç MutationObserver
  explorerSettings.cleanupDarkModeObserver();

  // åæ­¢é¢è§
  stopPreview();

  // æ¸çéæ©ç¶æ?
  clearSelection();
});
</script>

<style scoped>
/* Smooth View Transitions */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
