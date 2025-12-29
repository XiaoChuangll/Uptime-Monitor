<template>
  <el-dialog
    v-model="visible"
    title="访客统计"
    :width="isMobile ? '100%' : '900px'"
    :fullscreen="isMobile"
  >
  <el-row :gutter="16" class="stats-grid mb-4">
    <el-col :xs="12" :sm="12" :md="6">
      <div class="stat-card">
        <div class="stat-label">总访客</div>
        <div class="stat-value">{{ total }}</div>
      </div>
    </el-col>
    <el-col :xs="12" :sm="12" :md="6">
      <div class="stat-card">
        <div class="stat-label">唯一IP</div>
        <div class="stat-value">{{ uniqueIp }}</div>
      </div>
    </el-col>
    <el-col :xs="12" :sm="12" :md="6">
      <div class="stat-card">
        <div class="stat-label">地区数</div>
        <div class="stat-value">{{ locationKinds }}</div>
      </div>
    </el-col>
    <el-col :xs="12" :sm="12" :md="6">
      <div class="stat-card">
        <div class="stat-label">设备种类</div>
        <div class="stat-value">{{ deviceKinds }}</div>
      </div>
    </el-col>
  </el-row>

    <el-tabs>
      <el-tab-pane label="按地区">
        <el-table :data="locationRows" stripe>
          <el-table-column prop="name" label="地区" />
          <el-table-column prop="count" label="数量" width="120" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="按设备">
        <el-table :data="deviceRows" stripe>
          <el-table-column prop="name" label="设备" />
          <el-table-column prop="count" label="数量" width="120" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="实时访客">
        <el-table :data="items" stripe v-loading="loading" class="live-table">
          <el-table-column prop="timestamp" label="时间" width="180" :formatter="formatTime" />
          <el-table-column prop="ip" label="IP" width="140" />
          <el-table-column prop="location" label="地区" />
          <el-table-column prop="device" label="设备" />
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="close">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { getVisitorStats, type Visitor } from '../services/api';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits(['update:modelValue']);

const visible = ref<boolean>(props.modelValue);
watch(() => props.modelValue, (v) => { visible.value = v; });
watch(visible, (v) => emit('update:modelValue', v));

const items = ref<Visitor[]>([]);
const totalCount = ref<number>(0);
const uniqueIpCount = ref<number>(0);
const locationKindsCount = ref<number>(0);
const deviceKindsCount = ref<number>(0);
const loading = ref(false);
let timer: number | undefined;
const isMobile = ref(false);
const updateIsMobile = () => { isMobile.value = window.innerWidth <= 768; };

const fetchData = async () => {
  loading.value = true;
  try {
    const stats = await getVisitorStats();
    items.value = stats.visitors;
    totalCount.value = stats.total;
    uniqueIpCount.value = (stats as any).uniqueIp ?? (stats as any).unique_ip ?? 0;
    locationKindsCount.value = (stats as any).locationKinds ?? (stats as any).location_kinds ?? 0;
    deviceKindsCount.value = (stats as any).deviceKinds ?? (stats as any).device_kinds ?? 0;
    locationRows.value = (stats as any).locationStats ?? (stats as any).location_stats ?? [];
    deviceRows.value = (stats as any).deviceStats ?? (stats as any).device_stats ?? [];
  } finally {
    loading.value = false;
  }
};

const total = computed(() => totalCount.value);
const uniqueIp = computed(() => uniqueIpCount.value);
const locationKinds = computed(() => locationKindsCount.value);
const deviceKinds = computed(() => deviceKindsCount.value);
const formatTime = (_: any, __: any, cellValue: string) => {
  try {
    const s = cellValue;
    const iso = s.includes('T') ? (s.endsWith('Z') ? s : s + 'Z') : s.replace(' ', 'T') + 'Z';
    const date = new Date(iso);
    return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  } catch {
    return cellValue;
  }
};

const locationRows = ref<Array<{ name: string; count: number }>>([]);
const deviceRows = ref<Array<{ name: string; count: number }>>([]);
watch(items, () => {
  if (locationRows.value.length === 0 || deviceRows.value.length === 0) {
    const locMap = new Map<string, number>();
    items.value.forEach((v) => {
      const key = v.location || '未知';
      locMap.set(key, (locMap.get(key) || 0) + 1);
    });
    locationRows.value = Array.from(locMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const devMap = new Map<string, number>();
    items.value.forEach((v) => {
      const key = v.device || '未知';
      devMap.set(key, (devMap.get(key) || 0) + 1);
    });
    deviceRows.value = Array.from(devMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }
});

const close = () => { visible.value = false; };

onMounted(() => {
  updateIsMobile();
  window.addEventListener('resize', updateIsMobile);
  fetchData();
  timer = window.setInterval(fetchData, 10000);
});
onUnmounted(() => {
  window.removeEventListener('resize', updateIsMobile);
  if (timer) window.clearInterval(timer);
});
</script>

<style scoped>
.stats-grid {}
.stats-grid :deep(.el-col) { margin-bottom: 16px; }
.stat-card {
  background-color: var(--el-bg-color);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--el-box-shadow-light);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stat-label {
  font-size: 0.85rem;
  color: var(--el-text-color-secondary);
}
.stat-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.live-card {
  background-color: var(--el-bg-color);
  border-radius: 16px;
  padding: 12px;
  box-shadow: var(--el-box-shadow-light);
}
.live-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 10px;
  color: var(--el-text-color-primary);
}
@media (max-width: 768px) {
  .stats-grid :deep(.el-col) { margin-bottom: 30px; }
}
</style>
