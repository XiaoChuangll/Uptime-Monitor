<script setup lang="ts">
import { useThemeStore } from './stores/theme';
import { useAuthStore } from './stores/auth';
import { useLayoutStore } from './stores/layout';
import { useRouter } from 'vue-router';
import { Moon, Sunny, Monitor, ArrowLeft, Notebook } from '@element-plus/icons-vue';
import { ref, onMounted, onUnmounted } from 'vue';
import { getVisitorStats } from './services/api';
import VisitorStatsDialog from './components/VisitorStatsDialog.vue';
import ChangelogDialog from './components/ChangelogDialog.vue';

const themeStore = useThemeStore();
const auth = useAuthStore();
const layoutStore = useLayoutStore();
const router = useRouter();
const goLogin = () => router.push({ name: 'login' });
const logout = () => auth.logout();

const visitorCount = ref<number>(0);
const showVisitorDialog = ref(false);
const showChangelog = ref(false);
let visitorTimer: number | undefined;

const fetchVisitorCount = async () => {
  try {
    const stats = await getVisitorStats();
    visitorCount.value = stats.total;
  } catch {
    
  }
};

const openVisitors = () => {
  showVisitorDialog.value = true;
};

const openChangelog = () => {
  showChangelog.value = true;
};

onMounted(() => {
  fetchVisitorCount();
  visitorTimer = window.setInterval(fetchVisitorCount, 10000);
});
onUnmounted(() => {
  if (visitorTimer) window.clearInterval(visitorTimer);
});
</script>

<template>
  <el-container class="layout-container">
    <el-header class="header">
      <transition name="header-slide" mode="out-in">
        <div class="logo" v-if="!layoutStore.isScrolled || !layoutStore.pageTitle" key="default">
          <el-icon :size="24" class="mr-2"><Monitor /></el-icon>
          <span>服务监控</span>
        </div>
        <div class="logo page-nav" v-else key="scrolled">
          <el-button 
            v-if="layoutStore.showBackButton" 
            link 
            @click="layoutStore.backAction" 
            class="mr-2 back-btn"
          >
            <el-icon :size="24"><ArrowLeft /></el-icon>
          </el-button>
          <span class="scrolled-title">{{ layoutStore.pageTitle }}</span>
        </div>
      </transition>
      
      <div class="actions">
        <el-button :icon="Notebook" circle @click="openChangelog" class="mr-2" />
        <el-button :icon="themeStore.isDark ? Moon : Sunny" circle @click="themeStore.toggleTheme" />
      </div>
    </el-header>
    <el-main>
      <router-view />
    </el-main>
    <el-footer class="footer">
      <div class="footer-actions">
        <span class="visitor-pill" role="button" tabindex="0" @click="openVisitors">
          实时访客 {{ visitorCount }}
        </span>
        <div class="spacer"></div>
        <el-button link @click="router.push({ name: 'about' })" class="mr-2">关于</el-button>
        <el-button v-if="!auth.isLoggedIn()" type="primary" @click="goLogin">登录</el-button>
        <el-button v-else type="danger" @click="logout">退出登录</el-button>
      </div>
      <VisitorStatsDialog v-model="showVisitorDialog" />
      <ChangelogDialog v-model="showChangelog" />
    </el-footer>
  </el-container>
</template>

<style scoped>
.layout-container {
  min-height: 100vh;
  transition: background-color 0.3s, color 0.3s;
}
.header {
  background-color: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  transition: background-color 0.3s, border-color 0.3s;
  padding: 12px 20px;
  position: sticky;
  top: 0;
  z-index: 2000;
  height: 60px;
}
.logo {
  display: flex;
  align-items: center;
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.page-nav {
  display: flex;
  align-items: center;
}
.scrolled-title {
  font-size: 1.1rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.back-btn {
  padding: 0;
  height: auto;
  color: var(--el-text-color-primary);
}
.mr-2 {
  margin-right: 8px;
}

/* Header Transition */
.header-slide-enter-active,
.header-slide-leave-active {
  transition: all 0.3s ease;
}

.header-slide-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}
.header-slide-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

.el-main {
  padding: 20px;
}

.footer {
  background-color: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color);
  padding: 12px 20px;
}
.footer-actions {
  display: flex;
  align-items: center;
}
.visitor-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  border: 1px solid var(--el-border-color);
  border-radius: 9999px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s, border-color 0.2s;
}
.visitor-pill:hover {
  background-color: var(--el-fill-color);
  border-color: var(--el-color-primary);
}
.spacer { flex: 1; }
</style>
