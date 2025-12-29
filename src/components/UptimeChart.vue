<template>
  <div ref="chartRef" class="chart-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import * as echarts from 'echarts';

const props = defineProps<{
  data: Array<{ datetime: number; value: number }>;
}>();

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

const initChart = () => {
  if (!chartRef.value) return;
  
  chartInstance = echarts.init(chartRef.value);
  
  const option = {
    title: { text: 'Response Time (ms)', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: props.data.map(d => new Date(d.datetime * 1000).toLocaleTimeString()),
    },
    yAxis: { type: 'value' },
    series: [
      {
        data: props.data.map(d => d.value),
        type: 'line',
        smooth: true,
        areaStyle: {},
        color: '#409EFF'
      },
    ],
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true }
  };
  
  chartInstance.setOption(option);
};

watch(() => props.data, () => {
  if (chartInstance) {
    chartInstance.setOption({
      xAxis: { data: props.data.map(d => new Date(d.datetime * 1000).toLocaleTimeString()) },
      series: [{ data: props.data.map(d => d.value) }]
    });
  }
});

onMounted(() => {
  initChart();
  window.addEventListener('resize', () => chartInstance?.resize());
});
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 300px;
}
</style>
