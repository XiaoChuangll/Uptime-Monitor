<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3">访客日志</span>
      </template>
    </el-page-header>

    <div class="filter-toolbar mb-4">
      <el-select
        v-model="filterLocation"
        placeholder="筛选地区"
        class="toolbar-select"
        clearable
        filterable
        @change="onSearch"
        @clear="onSearch"
      >
        <el-option
          v-for="item in locationOptions"
          :key="item.name"
          :label="`${item.name} (${item.count})`"
          :value="item.name"
        />
      </el-select>

      <el-select
        v-model="filterDevice"
        placeholder="筛选设备"
        class="toolbar-select"
        clearable
        filterable
        @change="onSearch"
        @clear="onSearch"
      >
        <el-option
          v-for="item in deviceOptions"
          :key="item.name"
          :label="`${item.name} (${item.count})`"
          :value="item.name"
        />
      </el-select>

      <el-input
        v-model="filterPath"
        placeholder="搜索路径"
        class="toolbar-input"
        clearable
        @keyup.enter="onSearch"
        @clear="onSearch"
      />

      <el-button type="primary" :icon="Search" @click="onSearch">搜索</el-button>
      <div class="toolbar-spacer"></div>
      <el-button type="danger" :icon="Delete" :disabled="selectedIds.length === 0" @click="handleDelete">
        批量删除
      </el-button>
      <el-button type="success" :icon="Download" @click="exportCsv">导出 CSV</el-button>
    </div>

    <el-card class="mb-4" shadow="hover">
      <template #header>
        <div class="card-header card-header-tabs">
          <el-tabs v-model="activeTrendTab" class="trend-tabs">
            <el-tab-pane label="概览" name="overview" />
            <el-tab-pane label="行为类别" name="activity" />
            <el-tab-pane label="比较" name="compare" />
          </el-tabs>
        </div>
      </template>

      <div v-show="activeTrendTab === 'overview'" class="trend-panel">
        <div class="trend-title-bar">
          <div class="trend-title">访客趋势 · {{ trendLabel }}</div>
          <el-select v-model="trendRange" size="small" class="trend-select" @change="refreshTrend">
            <el-option
              v-for="range in trendRanges"
              :key="range.key"
              :label="range.label"
              :value="range.key"
            />
          </el-select>
        </div>
        <div ref="chartRef" class="chart-container"></div>
      </div>

      <div v-show="activeTrendTab === 'activity'" class="trend-panel">
        <el-table
          :data="items"
          style="width: 100%"
          stripe
          v-loading="loading"
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" width="55" />
          <el-table-column prop="timestamp" label="时间" width="180" :formatter="formatTime" />
          <el-table-column prop="ip" label="IP" width="140" />
          <el-table-column prop="path" label="访问路径" min-width="220" show-overflow-tooltip :formatter="formatPath" />
          <el-table-column prop="location" label="地区" width="180" show-overflow-tooltip />
          <el-table-column prop="device" label="设备" show-overflow-tooltip />
        </el-table>

        <div class="pagination">
          <el-pagination
            background
            layout="total, prev, pager, next"
            :page-size="pageSize"
            :total="total"
            :current-page="page"
            @current-change="onPageChange"
          />
        </div>
      </div>

      <div v-show="activeTrendTab === 'compare'" class="trend-panel">
        <div class="compare-toolbar">
          <div class="compare-toolbar-right">
            <el-select v-model="compareLeftRange" size="small" class="compare-range-select" @change="loadCompare">
              <el-option
                v-for="range in trendRanges"
                :key="range.key"
                :label="range.label"
                :value="range.key"
              />
            </el-select>
            <span class="compare-vs">VS</span>
            <el-select v-model="compareRightRange" size="small" class="compare-range-select" @change="loadCompare">
              <el-option
                v-for="range in trendRanges"
                :key="range.key"
                :label="range.label"
                :value="range.key"
              />
            </el-select>
          </div>
        </div>

        <div class="compare-metrics">
          <div v-for="metric in compareMetrics" :key="metric.key" class="compare-metric-card">
            <div class="compare-metric-label">{{ metric.label }}</div>
            <div class="compare-metric-value">{{ metric.valueText }}</div>
            <div class="compare-metric-meta">
              <span>{{ metric.leftLabel }}：{{ metric.leftText }}</span>
              <span>{{ metric.rightLabel }}：{{ metric.rightText }}</span>
            </div>
            <div class="compare-metric-change" :class="metric.changeClass">{{ metric.deltaText }}</div>
          </div>
        </div>

        <div class="compare-chart-title">趋势对比 · {{ compareLeftLabel }} vs {{ compareRightLabel }}（按区间内日序）</div>
        <div ref="compareChartRef" class="chart-container compare-chart"></div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Download, Delete, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as echarts from 'echarts';
import { batchDeleteVisitors, exportVisitors, getVisitorStats, getVisitorSummary, getVisitorTrend, type Visitor } from '../../services/api';
import { connectWS, onWS } from '../../services/ws';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;

const router = useRouter();
const items = ref<Visitor[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const chartRef = ref<HTMLElement | null>(null);
const compareChartRef = ref<HTMLElement | null>(null);
const filterLocation = ref('');
const filterDevice = ref('');
const filterPath = ref('');
const locationOptions = ref<Array<{ name: string; count: number }>>([]);
const deviceOptions = ref<Array<{ name: string; count: number }>>([]);
const selectedIds = ref<number[]>([]);
const activeTrendTab = ref<'overview' | 'activity' | 'compare'>('overview');

const trendRanges = [
  { key: 'last_24h', label: '最近24小时', days: 1 },
  { key: 'today', label: '今天', days: 1 },
  { key: 'this_week', label: '本周', days: 7 },
  { key: 'last_7', label: '最近7天', days: 7 },
  { key: 'this_month', label: '本月', days: 30 },
  { key: 'last_30', label: '最近30天', days: 30 },
  { key: 'last_90', label: '最近90天', days: 90 },
  { key: 'last_180', label: '最近180天', days: 180 }
] as const;

const trendRange = ref<(typeof trendRanges)[number]['key']>('last_30');
const compareLeftRange = ref<(typeof trendRanges)[number]['key']>('last_7');
const compareRightRange = ref<(typeof trendRanges)[number]['key']>('last_30');
const compareLeftStats = ref({ visits: 0, uniqueIps: 0 });
const compareRightStats = ref({ visits: 0, uniqueIps: 0 });
const compareLeftTrend = ref<Array<{ date: string; count: number; unique_ip: number }>>([]);
const compareRightTrend = ref<Array<{ date: string; count: number; unique_ip: number }>>([]);

let chartInstance: echarts.ECharts | null = null;
let compareChartInstance: echarts.ECharts | null = null;
let refreshTimer: number | null = null;
let unbindWS: (() => void) | null = null;
let overviewResizeObserver: ResizeObserver | null = null;
let compareResizeObserver: ResizeObserver | null = null;

const trendLabel = computed(() => trendRanges.find((r) => r.key === trendRange.value)?.label || '最近30天');
const compareLeftLabel = computed(() => trendRanges.find((r) => r.key === compareLeftRange.value)?.label || '');
const compareRightLabel = computed(() => trendRanges.find((r) => r.key === compareRightRange.value)?.label || '');
const compareLeftDays = computed(() => getRangeDays(compareLeftRange.value));
const compareRightDays = computed(() => getRangeDays(compareRightRange.value));

const compareMetrics = computed(() => {
  const makeDelta = (current: number, previous: number) => {
    if (!previous) return null;
    return ((current - previous) / previous) * 100;
  };
  const buildMetric = (label: string, leftValue: number, rightValue: number, decimals = 0) => {
    const delta = makeDelta(leftValue, rightValue);
    const formatter = (value: number) => decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString();
    return {
      key: label,
      label,
      valueText: formatter(leftValue),
      leftText: formatter(leftValue),
      rightText: formatter(rightValue),
      leftLabel: compareLeftLabel.value,
      rightLabel: compareRightLabel.value,
      deltaText: delta === null ? '—' : `${delta >= 0 ? '+' : ''}${Math.round(delta)}%`,
      changeClass: delta === null ? 'is-muted' : delta >= 0 ? 'is-up' : 'is-down'
    };
  };
  const leftAvgVisits = compareLeftDays.value ? compareLeftStats.value.visits / compareLeftDays.value : 0;
  const rightAvgVisits = compareRightDays.value ? compareRightStats.value.visits / compareRightDays.value : 0;
  const leftAvgUnique = compareLeftDays.value ? compareLeftStats.value.uniqueIps / compareLeftDays.value : 0;
  const rightAvgUnique = compareRightDays.value ? compareRightStats.value.uniqueIps / compareRightDays.value : 0;
  return [
    buildMetric('独立访客', compareLeftStats.value.uniqueIps, compareRightStats.value.uniqueIps),
    buildMetric('访问次数', compareLeftStats.value.visits, compareRightStats.value.visits),
    buildMetric('日均独立访客', leftAvgUnique, rightAvgUnique, 1),
    buildMetric('日均访问次数', leftAvgVisits, rightAvgVisits, 1),
  ];
});

const buildCompareAxisLabels = (leftTrend: Array<{ date: string }>, rightTrend: Array<{ date: string }>) => {
  const maxLen = Math.max(leftTrend.length, rightTrend.length);
  return Array.from({ length: maxLen }, (_, index) => `第${index + 1}天`);
};

const padTrendData = <T,>(list: T[], targetLength: number, mapper: (item: T) => number) =>
  Array.from({ length: targetLength }, (_, index) => {
    const item = list[index];
    return item ? mapper(item) : null;
  });

const formatMetricTooltip = (params: any[]) => {
  const lines = params
    .map((item) => {
      const rawDate =
        item.seriesName === compareLeftLabel.value
          ? compareLeftTrend.value[item.dataIndex]?.date
          : compareRightTrend.value[item.dataIndex]?.date;
      const dateText = rawDate ? ` (${rawDate})` : '';
      return `${item.marker}${item.seriesName}${dateText}: ${item.value ?? 0}`;
    })
    .join('<br/>');
  return `${params[0]?.axisValueLabel || ''}<br/>${lines}`;
};

const getRangeDays = (key: (typeof trendRanges)[number]['key']) => trendRanges.find((r) => r.key === key)?.days || 30;

const fetchList = async () => {
  loading.value = true;
  try {
    const data = await getVisitorStats(page.value, pageSize.value, {
      location: filterLocation.value,
      device: filterDevice.value,
      path: filterPath.value
    });
    items.value = data.visitors;
    total.value = data.total;
    locationOptions.value = data.locationStats || [];
    deviceOptions.value = data.deviceStats || [];
  } finally {
    loading.value = false;
  }
};

const renderOverviewChart = async () => {
  if (!chartRef.value) return;
  const trend = await getVisitorTrend(trendRange.value);
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }

  chartInstance.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['访问量', '独立IP'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: trend.map((item) => item.date),
      axisLabel: { rotate: 45 }
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: '访问量',
        type: 'line',
        smooth: true,
        data: trend.map((item) => item.count),
        itemStyle: { color: '#409EFF' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(64,158,255,0.5)' },
            { offset: 1, color: 'rgba(64,158,255,0.1)' }
          ])
        }
      },
      {
        name: '独立IP',
        type: 'line',
        smooth: true,
        data: trend.map((item) => item.unique_ip),
        itemStyle: { color: '#67C23A' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(103,194,58,0.5)' },
            { offset: 1, color: 'rgba(103,194,58,0.1)' }
          ])
        }
      }
    ]
  });
};

const renderCompareChart = () => {
  if (!compareChartRef.value) return;
  if (!compareChartInstance) {
    compareChartInstance = echarts.init(compareChartRef.value);
  }

  const labels = buildCompareAxisLabels(compareLeftTrend.value, compareRightTrend.value);
  const maxLen = labels.length;
  compareChartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: formatMetricTooltip
    },
    legend: { data: [compareLeftLabel.value, compareRightLabel.value] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { rotate: 45 }
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: compareLeftLabel.value,
        type: 'bar',
        data: padTrendData(compareLeftTrend.value, maxLen, (item) => item.count),
        itemStyle: { color: '#4C9BFF' }
      },
      {
        name: compareRightLabel.value,
        type: 'line',
        smooth: true,
        data: padTrendData(compareRightTrend.value, maxLen, (item) => item.count),
        itemStyle: { color: '#B86BFF' }
      }
    ]
  });
};

const refreshTrend = async () => {
  await nextTick();
  await renderOverviewChart();
};

const loadCompare = async () => {
  const [leftTrend, rightTrend, leftSummary, rightSummary] = await Promise.all([
    getVisitorTrend(compareLeftRange.value),
    getVisitorTrend(compareRightRange.value),
    getVisitorSummary(compareLeftRange.value),
    getVisitorSummary(compareRightRange.value)
  ]);
  compareLeftTrend.value = leftTrend;
  compareRightTrend.value = rightTrend;
  compareLeftStats.value = {
    visits: leftSummary.visits,
    uniqueIps: leftSummary.uniqueIp
  };
  compareRightStats.value = {
    visits: rightSummary.visits,
    uniqueIps: rightSummary.uniqueIp
  };
  await nextTick();
  renderCompareChart();
};

const onSearch = () => {
  page.value = 1;
  fetchList();
};

const handleSelectionChange = (selection: Visitor[]) => {
  selectedIds.value = selection.map((item) => item.id);
};

const handleDelete = async () => {
  if (!selectedIds.value.length) return;
  try {
    await ElMessageBox.confirm(`确定要删除选中的 ${selectedIds.value.length} 条记录吗？`, '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });
    await batchDeleteVisitors(selectedIds.value);
    ElMessage.success('删除成功');
    selectedIds.value = [];
    fetchList();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败');
    }
  }
};

const formatTime = (_row: unknown, _col: unknown, val: string) => {
  if (!val) return '';
  const date = new Date(val.endsWith('Z') ? val : `${val}Z`);
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
};

const formatPath = (_row: unknown, _col: unknown, val: string) => val || '/';

const onPageChange = (p: number) => {
  page.value = p;
  fetchList();
};

const exportCsv = async () => {
  try {
    await exportVisitors();
  } catch {
    ElMessage.error('导出失败');
  }
};

const goBack = () => {
  router.push('/admin');
};

const handleResize = () => {
  chartInstance?.resize();
  compareChartInstance?.resize();
};

const bindChartResizeObservers = () => {
  if (chartRef.value && !overviewResizeObserver) {
    overviewResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !chartInstance) return;
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        chartInstance.resize();
      }
    });
    overviewResizeObserver.observe(chartRef.value);
  }

  if (compareChartRef.value && !compareResizeObserver) {
    compareResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !compareChartInstance) return;
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        compareChartInstance.resize();
      }
    });
    compareResizeObserver.observe(compareChartRef.value);
  }
};

watch(activeTrendTab, async (tab) => {
  await nextTick();
  if (tab === 'overview') {
    renderOverviewChart();
  }
  if (tab === 'compare') {
    loadCompare();
  }
  bindChartResizeObservers();
});

onMounted(async () => {
  connectWS();
  window.addEventListener('resize', handleResize);
  await fetchList();
  await refreshTrend();
  bindChartResizeObservers();
  refreshTimer = window.setInterval(() => {
    fetchList();
    if (activeTrendTab.value === 'overview') {
      refreshTrend();
    }
    if (activeTrendTab.value === 'compare') {
      loadCompare();
    }
  }, 10000);

  unbindWS = onWS((type, payload) => {
    if (type !== 'visitors:new') return;
    const matchesLocation = !filterLocation.value || payload.location?.includes(filterLocation.value);
    const matchesDevice = !filterDevice.value || payload.device?.includes(filterDevice.value);
    const matchesPath = !filterPath.value || payload.path?.includes(filterPath.value);
    if (page.value === 1 && matchesLocation && matchesDevice && matchesPath) {
      items.value.unshift(payload);
      if (items.value.length > pageSize.value) {
        items.value.pop();
      }
    }
    total.value += 1;
    refreshTrend();
  });
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  unbindWS?.();
  chartInstance?.dispose();
  compareChartInstance?.dispose();
  overviewResizeObserver?.disconnect();
  compareResizeObserver?.disconnect();
  chartInstance = null;
  compareChartInstance = null;
  overviewResizeObserver = null;
  compareResizeObserver = null;
});
</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.toolbar-select,
.toolbar-input {
  width: 220px;
}
.toolbar-spacer {
  flex: 1;
}
.card-header-tabs {
  display: flex;
  align-items: center;
}
.trend-tabs {
  width: 100%;
}
.trend-tabs :deep(.el-tabs__header) {
  margin: 0;
}
.trend-panel {
  min-height: 320px;
}
.trend-title-bar,
.compare-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.trend-title {
  font-weight: 600;
}
.trend-select {
  width: 140px;
}
.chart-container {
  width: 100%;
  height: 320px;
}
.compare-chart {
  height: 360px;
}
.compare-toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.compare-range-select {
  width: 180px;
  flex-shrink: 0;
}
.compare-vs {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
}
.compare-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.compare-metric-card {
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  background: var(--el-fill-color-blank);
}
.compare-metric-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.compare-metric-value {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 700;
}
.compare-metric-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.compare-metric-change {
  margin-top: 6px;
  font-size: 13px;
}
.compare-metric-change.is-up {
  color: var(--el-color-success);
}
.compare-metric-change.is-down {
  color: var(--el-color-danger);
}
.compare-metric-change.is-muted {
  color: var(--el-text-color-secondary);
}
.compare-chart-title {
  margin-bottom: 12px;
  font-weight: 600;
}
.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .toolbar-select,
  .toolbar-input {
    width: 100%;
  }
  .toolbar-spacer {
    display: none;
  }
  .trend-title-bar,
  .compare-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .compare-toolbar-right {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }
  .compare-range-select {
    width: 100%;
  }
  .compare-vs {
    align-self: center;
  }
}
</style>
