<script setup lang="ts">
import { useThemeStore } from './stores/theme';
import { useAuthStore } from './stores/auth';
import { useLayoutStore } from './stores/layout';
import { useRouter, useRoute } from 'vue-router';
import { Moon, Sunny, ArrowLeft, Notebook, Setting, Back } from '@element-plus/icons-vue';
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { getVisitorStats } from './services/api';
import { trackVisit } from './services/api';
import VisitorStatsDialog from './components/VisitorStatsDialog.vue';
import ChangelogDialog from './components/ChangelogDialog.vue';
import MiniPlayer from './components/MiniPlayer.vue';
import { ElMessage } from 'element-plus';

const themeStore = useThemeStore();
const auth = useAuthStore();
const layoutStore = useLayoutStore();
const router = useRouter();
const route = useRoute();
const goLogin = () => router.push({ name: 'login' });

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

const isAdminRoute = computed(() => route.path.startsWith('/admin'));
const showAdminLogoutButton = computed(() => isAdminRoute.value && auth.isLoggedIn());

const goAdminEntry = () => {
  if (auth.isLoggedIn()) {
    router.push({ name: 'admin' });
  } else {
    ElMessage.info('请先登录管理员账号');
    goLogin();
  }
};

const handleAdminLogout = async () => {
  auth.logout();
  ElMessage.success('已退出登录');
  await router.push({ name: 'login' });
};

onMounted(() => {
  fetchVisitorCount();
  visitorTimer = window.setInterval(fetchVisitorCount, 10000);
});
onUnmounted(() => {
  if (visitorTimer) window.clearInterval(visitorTimer);
});

watch(
  () => route.fullPath,
  (path) => {
    trackVisit(path);
  },
  { immediate: true }
);
</script>

<template>
  <el-container class="layout-container">
    <el-header class="header">
      <transition name="header-slide" mode="out-in">
        <div class="logo" v-if="!layoutStore.isScrolled || !layoutStore.pageTitle" key="default">
          <template v-if="route.name === 'music'">
             <img src="/music.png" alt="Music" style="height: 32px; width: auto; margin-right: 8px;" />
             <span style="font-family: 'Segoe UI', sans-serif; font-weight: bold; letter-spacing: 1px;">MUSIC</span>
          </template>
          <template v-else>
            <img src="/favicon.svg" alt="Uptime Monitor" class="logo-icon mr-2" />
            <span>Uptime Monitor</span>
          </template>
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
        <el-button
          v-if="showAdminLogoutButton"
          :icon="Back"
          circle
          class="mr-2"
          aria-label="退出登录"
          @click="handleAdminLogout"
        />
        <el-button
          v-else
          :icon="Setting"
          circle
          class="mr-2"
          aria-label="后台入口"
          @click="goAdminEntry"
        />
        
        <!-- Changelog Button (Hidden on Music Page) -->
        <el-button v-if="route.name !== 'music'" :icon="Notebook" circle @click="openChangelog" class="mr-2" />

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
        <el-button v-if="route.name !== 'about'" link @click="router.push({ name: 'about' })" class="mr-2">关于</el-button>
        <template v-if="route.name !== 'music' && route.name !== 'login'">
          <el-button v-if="!auth.isLoggedIn()" type="primary" @click="goLogin">登录</el-button>
        </template>
      </div>
      <VisitorStatsDialog v-model="showVisitorDialog" />
      <ChangelogDialog v-model="showChangelog" />
      <MiniPlayer />
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
.logo-icon {
  width: 24px;
  height: 24px;
  display: block;
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
