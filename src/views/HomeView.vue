<template>
  <div class="home-view">
    <div class="dynamic-sections mb-4">
      <el-row :gutter="20">
        <template v-for="card in sortedCards" :key="card.key">
          <el-col :span="getCardStyle(card).span || 24" :xs="24" v-if="card.enabled === 1" class="card-col">
            
            <!-- Friend Links -->
            <div class="link-card" v-if="card.key === 'friend_links'">
              <div class="card-header">
                <div class="accent-bar" :class="getCardStyle(card).accent || 'bg-yellow'"></div>
                <h3 class="card-title">{{ card.title }}</h3>
              </div>
              <div class="card-content hover-effect" v-for="link in friendLinks" :key="link.id">
                <img :src="linkIcon(link)" class="card-icon-img" alt="Logo" />
                <a :href="link.url" target="_blank" class="card-text">{{ link.name }}</a>
              </div>
              <el-empty v-if="friendLinks.length===0" description="暂无友情链接" />
            </div>

            <!-- Group Chats -->
            <div class="link-card" v-if="card.key === 'group_chats'">
              <div class="card-header">
                <div class="accent-bar" :class="getCardStyle(card).accent || 'bg-green'"></div>
                <h3 class="card-title">{{ card.title }}</h3>
              </div>
              <div class="card-content hover-effect" v-for="g in groupChats" :key="g.id">
                <img v-if="g.avatar_url" :src="g.avatar_url" class="card-icon-img round" alt="Avatar" />
                <el-icon v-else :size="24" class="card-icon"><User /></el-icon>
                <a v-if="g.link" :href="g.link" target="_blank" class="card-text">{{ g.name }}</a>
                <span v-else class="card-text">{{ g.name }}</span>
              </div>
              <el-empty v-if="groupChats.length===0" description="暂无群聊" />
            </div>

            <!-- Announcements -->
            <div class="link-card" v-if="card.key === 'announcements'">
              <div class="card-header" style="justify-content: space-between;">
                <div style="display: flex; align-items: center;">
                  <div class="accent-bar" :class="getCardStyle(card).accent || 'bg-yellow'"></div>
                  <h3 class="card-title">{{ displayCategoryName }}</h3>
                </div>
                <div v-if="availableCategories.length > 1">
                  <el-dropdown trigger="click" :teleported="false" @command="handleCategorySwitch" @visible-change="handleDropdownVisibleChange">
                    <span class="el-dropdown-link">
                      <el-tooltip
                        :visible="showAnnouncementGuide"
                        content="点击此处可切换公告分类"
                        placement="top"
                        effect="light"
                        :show-arrow="true"
                        popper-class="header-covered-tooltip"
                      >
                        <el-button circle size="small" :icon="More" />
                      </el-tooltip>
                    </span>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item v-for="c in availableCategories" :key="c" :command="c">{{ c }}</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
              <div v-if="displayedAnnouncement" class="announcement-item">
                <div class="announcement-title">{{ displayedAnnouncement.title }}</div>
                <div class="announcement-content markdown-body" v-html="displayedAnnouncement.content_html"></div>
              </div>
              <el-empty v-else description="暂无公告" />
            </div>

            <!-- Apps -->
            <div class="link-card" v-if="card.key === 'apps'" @click="goApps">
              <div class="card-header">
                <div class="accent-bar" :class="getCardStyle(card).accent || 'bg-yellow'"></div>
                <h3 class="card-title">{{ card.title }}</h3>
              </div>
              <div class="apps-container" v-if="apps.length > 0">
                <div v-for="app in apps" :key="app.id" class="app-mini-item">
                  <img v-if="appIcon(app)" :src="appIcon(app)" class="app-mini-icon" :alt="app.name" :title="app.name" />
                  <el-icon v-else :size="24" class="app-icon-fallback" :title="app.name"><Monitor /></el-icon>
                </div>
              </div>
              <div class="card-content hover-effect" v-else>
                <el-icon class="card-icon" :size="24"><Monitor /></el-icon>
                <span class="card-text">应用列表</span>
              </div>
            </div>

          </el-col>
        </template>
        
        <!-- Admin Card (Removed) -->

      </el-row>
    </div>

    <div class="toolbar">
      <h2>仪表盘</h2>
      <div class="toolbar-actions">
        <el-dropdown @command="onFilterCommand">
          <el-button plain :icon="Filter">
            筛选：{{ filterLabel }}
            <el-icon class="el-icon--right"><CaretBottom /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="all">全部</el-dropdown-item>
              <el-dropdown-item command="up">正常</el-dropdown-item>
              <el-dropdown-item command="warn">异常</el-dropdown-item>
              <el-dropdown-item command="down">离线</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="primary" :icon="Refresh" @click="refresh" :loading="store.loading">刷新</el-button>
      </div>
    </div>
    
    <el-row :gutter="20" class="stats-grid mb-4">
      <el-col :xs="12" :sm="12" :md="6" :lg="6">
        <div class="stat-card">
          <div class="stat-head">
            <div class="stat-label">监控网站</div>
            <el-icon :size="20" class="stat-icon"><Monitor /></el-icon>
          </div>
          <div class="stat-value">{{ totalCount }}</div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6">
        <div class="stat-card">
          <div class="stat-head">
            <div class="stat-label">正常网站</div>
            <el-icon :size="20" class="stat-icon icon-success"><CircleCheck /></el-icon>
          </div>
          <div class="stat-value text-success">{{ upCount }}</div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6">
        <div class="stat-card">
          <div class="stat-head">
            <div class="stat-label">异常网站</div>
            <el-icon :size="20" class="stat-icon icon-warning"><WarningFilled /></el-icon>
          </div>
          <div class="stat-value text-warning">{{ abnormalCount }}</div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6">
        <div class="stat-card">
          <div class="stat-head">
            <div class="stat-label">平均响应</div>
            <el-icon :size="20" class="stat-icon icon-info"><Timer /></el-icon>
          </div>
          <div class="stat-value">{{ avgResponseMs }}ms</div>
        </div>
      </el-col>
    </el-row>
    
    <el-alert v-if="store.error" :title="store.error" type="error" show-icon class="mb-4" />

    <el-skeleton :loading="store.loading && store.monitors.length === 0" animated :count="3">
      <template #template>
        <el-skeleton-item variant="rect" style="width: 100%; height: 150px; margin-bottom: 20px" />
      </template>
      <template #default>
        <el-row :gutter="20">
          <el-col :xs="24" :sm="12" :md="8" :lg="6" v-for="monitor in filteredMonitors" :key="monitor.id" class="mb-4">
            <MonitorCard 
              :monitor="monitor" 
              :is-open="activeLogsId === monitor.id"
              @toggle-logs="handleToggleLogs(monitor.id)"
              @click="goToDetail(monitor.id)" 
            />
          </el-col>
        </el-row>
        <el-empty v-if="!store.loading && store.monitors.length === 0" description="暂无监控项目" />
      </template>
    </el-skeleton>

  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useMonitorStore } from '../stores/monitor';
import MonitorCard from '../components/MonitorCard.vue';
import { Refresh, Filter, CaretBottom, Monitor, User, More } from '@element-plus/icons-vue';
import { getPublicFriendLinks, getPublicGroupChats, getPublicAnnouncements, getPublicSiteCards, getPublicApps, type FriendLink, type SiteCard, type AppItem } from '../services/admin';
import { connectWS, onWS } from '../services/ws';

const store = useMonitorStore();
const router = useRouter();
const activeLogsId = ref<number | null>(null);

const siteCards = ref<SiteCard[]>([]);
const apps = ref<AppItem[]>([]);

const sortedCards = computed(() => {
  return [...siteCards.value].sort((a, b) => a.sort_order - b.sort_order);
});

const getCardStyle = (card: SiteCard) => {
  try { return JSON.parse(card.style || '{}'); } catch { return {}; }
};

const handleToggleLogs = (id: number) => {
  if (activeLogsId.value === id) {
    activeLogsId.value = null;
  } else {
    activeLogsId.value = id;
  }
};

const handleGlobalClick = () => {
  if (activeLogsId.value !== null) {
    activeLogsId.value = null;
  }
};

const friendLinks = ref<FriendLink[]>([]);
const groupChats = ref<any[]>([]);
const announcements = ref<any[]>([]);

const currentCategory = ref<string>('');

const groupedAnnouncements = computed(() => {
  const groups: Record<string, any[]> = {};
  announcements.value.forEach(a => {
    const cat = a.category_name || '公告';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(a);
  });
  return groups;
});

const availableCategories = computed(() => {
  const cats = Object.keys(groupedAnnouncements.value);
  // Sort '公告' to top
  return cats.sort((a, b) => {
    if (a === DEFAULT_CATEGORY) return -1;
    if (b === DEFAULT_CATEGORY) return 1;
    return 0;
  });
});

const displayedAnnouncement = computed(() => {
  let cat = currentCategory.value;
  if (!cat && availableCategories.value.length > 0) {
    cat = availableCategories.value[0]; // Since we sorted, this will be '公告' if present
  }
  if (cat && groupedAnnouncements.value[cat]) {
    return groupedAnnouncements.value[cat][0];
  }
  return null;
});

const displayCategoryName = computed(() => {
  if (currentCategory.value) return currentCategory.value;
  if (availableCategories.value.length > 0) return availableCategories.value[0];
  return DEFAULT_CATEGORY;
});

const handleCategorySwitch = (cat: string) => {
  currentCategory.value = cat;
};

const DEFAULT_CATEGORY = '公告';

const showAnnouncementGuide = ref(false);

const handleDropdownVisibleChange = (visible: boolean) => {
  if (visible && showAnnouncementGuide.value) {
    showAnnouncementGuide.value = false;
    localStorage.setItem('announcement_guide_seen', 'true');
  }
};

// Update currentCategory when announcements load
watch(announcements, (val) => {
  if (val.length > 0 && !currentCategory.value) {
     // Prioritize '公告' category
     const categories = val.map(a => a.category_name || DEFAULT_CATEGORY);
     if (categories.includes(DEFAULT_CATEGORY)) {
       currentCategory.value = DEFAULT_CATEGORY;
     } else {
       currentCategory.value = categories[0];
     }
  }
});

watch(availableCategories, (cats) => {
  if (cats.length > 1 && !localStorage.getItem('announcement_guide_seen')) {
    // Show guide after a short delay to ensure UI is ready
    setTimeout(() => {
      showAnnouncementGuide.value = true;
    }, 1000);
  }
});

const favicon = (url: string) => {
  try { const u = new URL(url); return `${u.origin}/favicon.ico`; } catch { return '/favicon.ico'; }
};

const linkIcon = (link: FriendLink) => {
  const u = typeof link.icon_url === 'string' ? link.icon_url.trim() : '';
  return u || favicon(link.url);
};

const appIcon = (item: any) => {
  if (item.icon_url) return item.icon_url;
  const direct = (item as any).icon || (item as any).logo;
  if (direct) return direct;
  const link = (item as any).url || (item as any).link || (item as any).homepage;
  if (!link) return null;
  try {
    const u = new URL(link);
    return `${u.origin}/favicon.ico`;
  } catch {
    return null;
  }
};

const filter = ref<'all' | 'up' | 'warn' | 'down'>('all');

const filteredMonitors = computed(() => {
  const list = store.monitors;
  switch (filter.value) {
    case 'up':
      return list.filter(m => m.status === 2);
    case 'warn':
      return list.filter(m => m.status === 8);
    case 'down':
      return list.filter(m => m.status === 9 || m.status === 0);
    default:
      return list;
  }
});

const filterLabel = computed(() => {
  if (filter.value === 'up') return '正常';
  if (filter.value === 'warn') return '异常';
  if (filter.value === 'down') return '离线';
  return '全部';
});

const onFilterCommand = (cmd: 'all' | 'up' | 'warn' | 'down') => {
  filter.value = cmd;
};

const totalCount = computed(() => store.monitors.length);
const upCount = computed(() => store.monitors.filter(m => m.status === 2).length);
const abnormalCount = computed(() => store.monitors.filter(m => m.status === 8 || m.status === 9 || m.status === 0).length);
const avgResponseMs = computed(() => {
  const values = store.monitors
    .map(m => (m.response_times && m.response_times.length > 0 ? m.response_times[0].value : null))
    .filter((v): v is number => typeof v === 'number' && isFinite(v));
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
});

onMounted(async () => {
  document.addEventListener('click', handleGlobalClick);
  store.fetchMonitors();
  try {
    const [links, groups, anns, cards, appList] = await Promise.all([
      getPublicFriendLinks(),
      getPublicGroupChats(),
      getPublicAnnouncements(),
      getPublicSiteCards(),
      getPublicApps()
    ]);
    friendLinks.value = links;
    groupChats.value = groups;
    announcements.value = anns;
    siteCards.value = cards;
    apps.value = appList;
    
    // Cache announcements
    if (anns.length > 0) {
      const ANN_CACHE_KEY = 'announcement_cache';
      localStorage.setItem(ANN_CACHE_KEY, JSON.stringify({ ts: Date.now(), items: anns }));
    }
  } catch (e) {
    console.error('Failed to load public data', e);
  }

  // Connect WebSocket
  connectWS();
  onWS((payload: any) => {
    // If payload is monitor update, we can update store directly if needed
    // But store.fetchMonitors() handles full refresh. 
    // Ideally update specific monitor in store.
    // For now, let's just refresh if meaningful update
    if (payload.type === 'monitor_update') {
      store.fetchMonitors();
    }
    if (payload.type === 'announcement_update') {
      // Refresh announcements
      getPublicAnnouncements().then(res => {
        announcements.value = res;
        const ANN_CACHE_KEY = 'announcement_cache';
        localStorage.setItem(ANN_CACHE_KEY, JSON.stringify({ ts: Date.now(), items: res }));
      });
    }
    if (payload.type === 'site_cards:update') {
      siteCards.value = payload.payload;
    }
  });
});

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick);
});

const refresh = () => {
  store.fetchMonitors();
};

const goToDetail = (id: number) => {
  router.push({ name: 'monitor-detail', params: { id } });
};

const goApps = () => {
  router.push({ name: 'apps' });
};
</script>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 40px;
  margin-bottom: 20px;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.mb-4 {
  margin-bottom: 20px;
}

.links-section {
  margin-bottom: 50px;
}

.links-section + .links-section {
  margin-top: 24px;
}



.link-card {
  background-color: var(--el-bg-color);
  border-radius: 16px;
  padding: 16px 16px 8px;
  box-shadow: var(--el-box-shadow-light);
  height: 100%;
  transition: transform 0.2s;
}

.link-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow);
}

/* 缩小空状态默认高度（不改变卡片间距） */
.link-card :deep(.el-empty) { padding: 8px 0; }
.link-card :deep(.el-empty__image) { width: 48px; height: 48px; }
.link-card :deep(.el-empty__description) { margin-top: 6px; }
.link-card :deep(.el-empty__description p) { font-size: 12px; }

.apps-container {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 0;
}

.app-mini-item {
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-mini-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: contain;
  transition: transform 0.2s;
  background-color: var(--el-fill-color-light);
}

.app-mini-icon:hover {
  transform: scale(1.1);
}

.app-icon-fallback {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-fill-color-light);
  border-radius: 8px;
  color: var(--el-text-color-secondary);
}

.mb-4 {
  margin-bottom: 20px;
}

.card-col {
  margin-bottom: 40px; /* Increased vertical spacing between cards */
}

.dynamic-sections {
  margin-bottom: 40px;
}

.card-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.accent-bar {
  width: 4px;
  height: 16px;
  border-radius: 4px;
  margin-right: 8px;
}

.bg-yellow {
  background-color: #fbbf24; /* amber-400 */
}

.bg-green {
  background-color: #10b981; /* emerald-500 */
}

.bg-blue {
  background-color: #3b82f6; /* blue-500 */
}

.bg-red {
  background-color: #ef4444; /* red-500 */
}

.bg-purple {
  background-color: #8b5cf6; /* violet-500 */
}

.card-title {
  font-weight: 700;
  font-size: 0.875rem;
  margin: 0;
  color: var(--el-text-color-primary);
}

.card-content {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  padding: 8px 0;
  opacity: 0.8;
  text-decoration: none;
  transition: opacity 0.2s;
}

.card-content:hover {
  opacity: 1;
}

.card-icon {
  margin-right: 12px;
  color: var(--el-text-color-primary);
}

.card-icon-img {
  width: 24px;
  height: 24px;
  margin-right: 12px;
  object-fit: cover;
  border-radius: 6px;
}

.card-icon-img.round {
  border-radius: 50%;
}

.card-text {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--el-text-color-primary);
  text-decoration: none;
}

.announcement-item { padding: 8px 0; border-top: 1px solid var(--el-border-color-light); }
.announcement-item:first-child { border-top: none; }
.announcement-title { font-weight: 600; margin-bottom: 6px; color: var(--el-text-color-primary); }
.announcement-content :deep(img) { max-width: 100%; border-radius: 6px; }

/* GitHub Markdown Tweaks */
.markdown-body {
  background-color: transparent !important;
  padding: 0 !important;
  font-size: 14px;
}

/* Ensure text color adapts if there is a mismatch between system theme and app theme, 
   though this is a partial fix. ideally system matches app. */
html.dark .markdown-body {
  color: #c9d1d9;
}
html:not(.dark) .markdown-body {
  color: #24292f;
}

.stats-grid {}
.stats-grid :deep(.el-col) { margin-bottom: 40px; }
.stat-card {
  background-color: var(--el-bg-color);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--el-box-shadow-light);
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
}
.stat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.stat-label {
  font-size: 0.85rem;
  color: var(--el-text-color-secondary);
}
.stat-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.stat-icon { color: var(--el-text-color-secondary); }
.icon-success { color: var(--el-color-success); }
.icon-warning { color: var(--el-color-warning); }
.icon-info { color: var(--el-color-primary); }
.text-success { color: var(--el-color-success); }
.text-warning { color: var(--el-color-warning); }

@media (max-width: 768px) {
  .stat-card { padding: 14px; }
  .stat-value { font-size: 1.4rem; }
  .stats-grid :deep(.el-col) { margin-bottom: 40px; }
}

</style>
