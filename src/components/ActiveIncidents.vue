<template>
  <div v-if="incidents.length > 0" class="active-incidents">
    <div v-for="item in incidents" :key="item.id" class="link-card incident-card" :class="getTypeClass(item)">
      <div class="card-header">
        <div class="header-left">
          <div class="accent-bar" :class="getAccentColor(item)"></div>
          <el-icon class="icon mr-2" v-if="item.type === 'maintenance'"><Tools /></el-icon>
          <el-icon class="icon mr-2" v-else><WarningFilled /></el-icon>
          <span class="card-title">{{ item.title }}</span>
        </div>
        <el-tag :type="getStatusType(item.status)" size="small" effect="dark" class="status-tag">
          {{ getStatusText(item.status) }}
        </el-tag>
      </div>
      
      <div class="card-content-block" v-if="item.content">
        <div class="markdown-body" v-html="renderMarkdown(item.content)"></div>
      </div>
      
      <div class="card-footer mt-3">
        <span v-if="item.start_time" class="time">
          开始: {{ new Date(item.start_time * 1000).toLocaleString() }}
        </span>
        <span v-if="item.end_time" class="time ml-3">
          预计结束: {{ new Date(item.end_time * 1000).toLocaleString() }}
        </span>
        <span class="time ml-auto updated">
          更新于: {{ new Date(item.updated_at * 1000).toLocaleString() }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getActiveIncidents, type Incident } from '../services/api';
import { WarningFilled, Tools } from '@element-plus/icons-vue';
import { marked } from 'marked';

const incidents = ref<Incident[]>([]);

const fetchIncidents = async () => {
  incidents.value = await getActiveIncidents();
};

const getStatusType = (status: string) => {
  switch (status) {
    case 'resolved': return 'success';
    case 'monitoring': return 'primary';
    case 'identified': return 'warning';
    case 'investigating': return 'danger';
    case 'scheduled': return 'info';
    default: return 'info';
  }
};

const getStatusText = (status: string) => {
  const map: Record<string, string> = {
    investigating: '正在调查',
    identified: '已确认',
    monitoring: '正在观察',
    resolved: '已解决',
    scheduled: '计划维护'
  };
  return map[status] || status;
};

const getTypeClass = (item: Incident) => {
  if (item.type === 'maintenance') return 'maintenance-card';
  if (item.status === 'resolved') return 'resolved-card';
  return 'incident-card-active';
};

const getAccentColor = (item: Incident) => {
  if (item.status === 'resolved') return 'bg-green';
  if (item.type === 'maintenance') return 'bg-blue';
  return 'bg-red';
};

const renderMarkdown = (text: string) => {
  return marked(text || '');
};

onMounted(() => {
  fetchIncidents();
});
</script>

<style scoped>
.active-incidents {
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Inherit link-card styles from global or mimic them here */
.link-card {
  background: var(--el-bg-color);
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--el-box-shadow-light);
  border: 1px solid var(--el-border-color-lighter);
  transition: transform 0.3s, box-shadow 0.3s;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.header-left {
  display: flex;
  align-items: center;
}

.accent-bar {
  width: 4px;
  height: 16px;
  border-radius: 2px;
  margin-right: 12px;
}

.bg-yellow { background-color: #f59e0b; }
.bg-green { background-color: #10b981; }
.bg-blue { background-color: #3b82f6; }
.bg-red { background-color: #ef4444; }

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.card-content-block {
  font-size: 14px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

.card-footer {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.ml-3 { margin-left: 12px; }
.ml-auto { margin-left: auto; }
.mr-2 { margin-right: 8px; }
.mt-3 { margin-top: 12px; }

/* Markdown Dark Mode Adaptation */
:deep(.markdown-body) {
  background-color: transparent !important;
  color: var(--el-text-color-primary) !important;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
}

:deep(.markdown-body p) {
  color: var(--el-text-color-regular);
  margin-bottom: 0.5em;
}

:deep(.markdown-body a) {
  color: var(--el-color-primary);
}

:deep(.markdown-body code) {
  background-color: var(--el-fill-color-light) !important;
  color: var(--el-text-color-primary) !important;
}

:deep(.markdown-body pre) {
  background-color: var(--el-fill-color-dark) !important;
}
</style>