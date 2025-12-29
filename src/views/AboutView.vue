<template>
  <div class="about-view">
    <el-page-header @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 关于本站 </span>
      </template>
    </el-page-header>

    <el-card class="about-card mb-4" v-if="aboutData.content_html">
      <div class="about-content ql-editor" v-html="aboutData.content_html"></div>
    </el-card>

    <el-card class="about-card mb-4">
      <template #header>
        <div class="card-header">
          <span>关于作者</span>
        </div>
      </template>
      <div class="about-content">
        <div class="info-row" style="height: 100px;">
          <span class="label">开发者</span>
          <div class="developer-info">
            <span class="value">{{ aboutData.author_name || 'ChuEng' }}</span>
            <div class="author-info" v-if="aboutData.author_avatar">
              <el-image 
                :src="aboutData.author_avatar" 
                fit="cover" 
                class="author-avatar"
                :preview-src-list="[aboutData.author_avatar]"
              />
            </div>
          </div>
        </div>
        <div class="info-row">
          <span class="label">Github</span>
          <a :href="aboutData.author_github || 'https://github.com/XiaoChuangll'" target="_blank" class="value link">
            {{ getGithubUsername(aboutData.author_github) || 'XiaoChuangll' }} <el-icon><Link /></el-icon>
          </a>
        </div>
      </div>
    </el-card>

    <el-card class="about-card mb-4">
      <template #header>
        <div class="card-header">
          <span>技术栈</span>
        </div>
      </template>
      <div class="tech-stack">
        <el-tag effect="plain" class="mr-2 mb-2">Vue 3</el-tag>
        <el-tag effect="plain" class="mr-2 mb-2">TypeScript</el-tag>
        <el-tag effect="plain" class="mr-2 mb-2">Vite</el-tag>
        <el-tag effect="plain" class="mr-2 mb-2">Element Plus</el-tag>
        <el-tag effect="plain" class="mr-2 mb-2">Pinia</el-tag>
        <el-tag effect="plain" class="mr-2 mb-2">Vue Router</el-tag>
        <el-tag effect="plain" class="mr-2 mb-2">ECharts</el-tag>
      </div>
    </el-card>

    <div class="footer-info">
      <p>Version {{ aboutData.version || '1.0.0' }}</p>
      <p>&copy; {{ new Date().getFullYear() }} BetaHub Tech. All rights reserved.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { onMounted, onUnmounted, ref } from 'vue';
import { useLayoutStore } from '../stores/layout';
import { Link } from '@element-plus/icons-vue';
import { getAboutPage, type AboutPageData } from '../services/api';
import '@vueup/vue-quill/dist/vue-quill.snow.css'; // Import Quill styles for content rendering

const router = useRouter();
const layoutStore = useLayoutStore();
const aboutData = ref<AboutPageData>({});

const goBack = () => {
  router.push('/');
};

const getGithubUsername = (url?: string) => {
  if (!url) return '';
  const parts = url.split('/');
  return parts[parts.length - 1] || 'GitHub';
};

// Scroll Handler
let ticking = false;

const checkScrollPosition = () => {
  // Use window.scrollY directly for more robust detection
  // When scrolled down more than 60px (header height), switch to sticky header
  layoutStore.setHeaderState(window.scrollY > 60);
};

const handleScroll = () => {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      checkScrollPosition();
      ticking = false;
    });
    ticking = true;
  }
};

const fetchData = async () => {
  const data = await getAboutPage();
  if (data && Object.keys(data).length > 0) {
    aboutData.value = data;
  } else {
    // Default fallback if no data in DB yet
    aboutData.value = {
      content_html: `
        <h2>服务监控系统</h2>
        <p>这是一个基于 Vue 3 + TypeScript + Element Plus 构建的服务监控系统。</p>
        <p>主要功能包括：</p>
        <ul>
          <li>实时监控服务状态（UptimeRobot 集成）</li>
          <li>服务响应时间统计与趋势图</li>
          <li>多维度访客日志分析</li>
          <li>公告发布与管理系统</li>
          <li>友情链接与群组管理</li>
          <li>应用分发中心</li>
        </ul>
      `,
      author_name: 'ChuEng',
      author_github: 'https://github.com/XiaoChuangll',
      version: '1.0.0'
    };
  }
};

onMounted(async () => {
  window.scrollTo(0, 0);
  window.addEventListener('scroll', handleScroll);
  layoutStore.setPageInfo('关于本站', true, goBack);
  // Initial check
  checkScrollPosition();
  await fetchData();
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
  layoutStore.reset();
});
</script>

<style scoped>
.about-view {
  max-width: 800px;
  margin: 0 auto;
}
.mb-4 {
  margin-bottom: 20px;
}
.about-card {
  border-radius: 12px;
}
.about-content {
  padding: 20px;
  line-height: 1.6;
}
.card-header {
  font-weight: 600;
  font-size: 16px;
}
.developer-info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.author-info {
  display: flex;
  justify-content: center;
  margin: 0;
}
.author-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 2px solid var(--el-border-color);
}
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 12px;
}
.info-row:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}
.info-row .label {
  color: var(--el-text-color-secondary);
}
.info-row .value {
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.info-row .link {
  color: var(--el-color-primary);
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 4px;
}
.info-row .link:hover {
  text-decoration: underline;
}
.tech-stack {
  padding: 20px;
}
.mr-2 { margin-right: 12px; }
.mb-2 { margin-bottom: 12px; }

h2 {
  margin-bottom: 20px;
  color: var(--el-text-color-primary);
}
p, ul {
  color: var(--el-text-color-regular);
  margin-bottom: 16px;
}
ul {
  padding-left: 20px;
}
li {
  margin-bottom: 8px;
}
.footer-info {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-light);
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
}
</style>
