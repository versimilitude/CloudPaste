<template>
  <div>
    <div class="flex items-center gap-1">
      <button
        v-if="canExpand"
        type="button"
        class="p-1 rounded"
        :class="darkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-white'"
        @click="$emit('toggle', node.path)"
        :title="node.expanded ? '收起' : '展开'"
      >
        <component :is="node.expanded ? IconChevronDown : IconChevronRight" size="xs" class="w-3 h-3" aria-hidden="true" />
      </button>
      <span v-else class="w-5"></span>

      <a
        href="#"
        class="flex items-center gap-2 min-w-0 px-2 py-1 rounded text-xs flex-1"
        :class="
          isSelected
            ? darkMode
              ? 'bg-gray-800 text-gray-100'
              : 'bg-white text-gray-900'
            : isAncestor
              ? darkMode
                ? 'text-gray-200 hover:bg-gray-800'
                : 'text-gray-700 hover:bg-white'
              : darkMode
                ? 'text-gray-300 hover:bg-gray-800'
                : 'text-gray-600 hover:bg-white'
        "
        @click.prevent="$emit('navigate', node.path)"
        @mouseenter="$emit('prefetch', node.path)"
      >
        <IconFolder size="sm" class="w-4 h-4 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ node.name || node.path }}</span>
      </a>
    </div>

    <div v-if="node.expanded" class="ml-5 mt-0.5 space-y-0.5">
      <div v-if="node.loading" class="text-xs py-1" :class="darkMode ? 'text-gray-500' : 'text-gray-500'">加载中…</div>
      <div v-else-if="node.error" class="text-xs py-1" :class="darkMode ? 'text-red-300' : 'text-red-600'">加载失败</div>
      <DriveTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :dark-mode="darkMode"
        :current-path="currentPath"
        @navigate="$emit('navigate', $event)"
        @prefetch="$emit('prefetch', $event)"
        @toggle="$emit('toggle', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { normalizeFsPath, isSameOrSubPath } from "@/utils/fsPathUtils.js";
import { IconFolder, IconChevronRight, IconChevronDown } from "@/components/icons";

defineOptions({ name: "DriveTreeNode" });

const props = defineProps({
  node: { type: Object, required: true },
  darkMode: { type: Boolean, default: false },
  currentPath: { type: String, required: true },
});

defineEmits(["navigate", "prefetch", "toggle"]);

const isSelected = computed(() => normalizeFsPath(props.node.path) === normalizeFsPath(props.currentPath));
const isAncestor = computed(() => isSameOrSubPath(props.node.path, props.currentPath));
const hasChildren = computed(() => Array.isArray(props.node.children) && props.node.children.length > 0);
const canExpand = computed(() => hasChildren.value || props.node.loading || props.node.error || props.node.expanded === false);
</script>

