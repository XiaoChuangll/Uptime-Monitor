<template>
  <el-dialog
    v-model="visible"
    title="更新日志"
    width="800px"
    :fullscreen="isMobile"
    append-to-body
    class="changelog-dialog"
  >
    <div class="changelog-list">
      <el-collapse v-model="activeNames" accordion v-if="items.length > 0">
        <el-collapse-item
          v-for="item in items"
          :key="item.id"
          :name="item.id"
        >
          <template #title>
            <div class="collapse-header">
              <el-icon class="mr-2"><Calendar /></el-icon>
              <div class="header-content">
                <span class="date">{{ formatTime(item.release_date) }}</span>
                <el-tag size="small" effect="plain" class="version-tag">{{ item.version }}</el-tag>
              </div>
            </div>
          </template>
          
          <div class="changelog-content">
            <div class="markdown-body" v-html="item.content_html"></div>
          </div>
        </el-collapse-item>
      </el-collapse>
      <el-empty v-else description="暂无更新日志" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Calendar } from '@element-plus/icons-vue';
import { getPublicChangelogs, type Changelog } from '../services/api';
import { onWS } from '../services/ws';
import 'github-markdown-css';

const props = defineProps<{
  modelValue: boolean
}>();

const emit = defineEmits(['update:modelValue']);

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const items = ref<Changelog[]>([]);
const activeNames = ref<number[]>([]);
const isMobile = ref(false);

const updateIsMobile = () => { isMobile.value = window.innerWidth <= 768; };

const fetchList = async () => {
  items.value = await getPublicChangelogs();
  if (items.value.length > 0) {
    // If user hasn't interacted, maybe we don't force expand first item every time it updates?
    // But original code did: activeNames.value = [items.value[0].id];
    // Let's keep it if list was empty, or just update data silently if list exists.
    if (activeNames.value.length === 0) {
      activeNames.value = [items.value[0].id];
    }
  }
};

watch(visible, (val) => {
  if (val && items.value.length === 0) {
    fetchList();
  }
});

onMounted(() => {
  updateIsMobile();
  window.addEventListener('resize', updateIsMobile);
  
  onWS((type, payload) => {
    if (type === 'changelogs:update') {
      items.value = payload;
      // Optional: if currently visible, maybe show a toast or highlight? 
      // For now just update the list.
    }
  });
});

onUnmounted(() => {
  window.removeEventListener('resize', updateIsMobile);
});

const formatTime = (time: string) => {
  if (!time) return '';
  return new Date(time).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};
</script>

<style scoped>
.changelog-list {
  padding: 0 10px;
  width: 100%;
  box-sizing: border-box;
}

/* 修复折叠面板标题溢出问题 */
:deep(.el-collapse-item__header) {
  padding: 0 10px;
  overflow: hidden;
  box-sizing: border-box;
}

.collapse-header {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0; /* 关键：允许内容收缩 */
}

.mr-2 {
  margin-right: 8px;
  flex-shrink: 0; /* 防止图标被压缩 */
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  min-width: 0; /* 关键：允许内容收缩 */
  gap: 8px; /* 添加间距 */
}

.date {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0; /* 关键：允许文本溢出省略 */
}

.version-tag {
  flex-shrink: 0; /* 防止版本标签被压缩 */
}

.changelog-content {
  padding: 10px 5px;
  box-sizing: border-box;
}

/* 确保折叠面板内容不溢出 */
:deep(.el-collapse-item__wrap) {
  will-change: height;
}

:deep(.el-collapse-item__content) {
  padding: 10px 10px;
  box-sizing: border-box;
}

/* Adapt GitHub Markdown to Element Plus Theme */
.markdown-body {
  background-color: transparent !important;
  color: var(--el-text-color-primary) !important;
  font-family: var(--el-font-family);
  font-size: 14px;
  line-height: 1.6;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* 确保内容区域不溢出 */
:deep(.el-dialog__body) {
  max-height: 70vh;
  overflow-y: auto;
}

@media (max-width: 768px) {
  :deep(.el-dialog__body) {
    max-height: calc(100vh - 160px);
  }
}

/* Ensure links and other elements adapt */
:deep(.markdown-body a) {
  color: var(--el-color-primary);
  word-break: break-word;
}

:deep(.markdown-body pre) {
  background-color: var(--el-fill-color-light) !important;
  overflow-x: auto;
  max-width: 100%;
  box-sizing: border-box;
}

:deep(.markdown-body code) {
  background-color: var(--el-fill-color) !important;
  word-break: break-word;
}

/* In dark mode, we might need more specific overrides if github-markdown-css doesn't handle it well with just transparent bg */
html.dark .markdown-body {
  color: #c9d1d9 !important;
}
</style>