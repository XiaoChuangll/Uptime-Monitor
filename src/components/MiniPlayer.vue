<template>
  <Teleport to="body">
    <!-- Playlist Mask -->
    <div v-if="showPlaylist" class="playlist-mask" @click="showPlaylist = false"></div>

    <transition name="fade">
      <div 
        v-if="store.showPlayer && store.currentTrack" 
        class="mini-player"
        :class="{ minimized: isMinimized }"
        ref="playerRef"
        :style="playerStyle"
        @click="handlePlayerClick"
      >
      <div v-if="isMinimized" class="minimized-content">
        <el-image :src="coverUrl" class="minimized-cover" fit="cover">
           <template #error><el-icon><Headset /></el-icon></template>
        </el-image>
        <div class="restore-overlay">
          <el-icon><ArrowLeft /></el-icon>
        </div>
      </div>

      <div v-else class="player-content">
        <!-- Water Fill Background -->
        <div class="water-fill-container">
           <div class="water-fill" :style="{ width: `${progressPercentage}%` }">
              <div class="water-wave"></div>
           </div>
        </div>

        <!-- Progress Bar at Top -->
        <div class="progress-bar-container" 
             @click.stop="handleProgressClick"
             @mousemove="handleProgressHover"
             @mouseleave="handleProgressLeave"
        >
           <div class="progress-handle" :style="{ left: `${progressPercentage}%` }"></div>
        </div>

        <!-- Info -->
        <div class="track-info">
          <el-image 
            :src="coverUrl" 
            class="track-cover"
            fit="cover"
          >
            <template #error>
              <div class="image-slot">
                <el-icon><Headset /></el-icon>
              </div>
            </template>
          </el-image>
          <div class="track-text">
            <div class="track-name">{{ store.currentTrack.name }}</div>
            <div class="track-artist">{{ artistName }}</div>
          </div>
        </div>

        <!-- Controls -->
        <div class="player-controls">
          <el-button circle size="small" link @click.stop="store.prev">
            <el-icon><ArrowLeft /></el-icon>
          </el-button>
          
          <el-button circle type="primary" class="play-btn" @click.stop="store.togglePlay" :loading="false">
            <el-icon v-if="store.loading" class="is-loading"><Loading /></el-icon>
            <el-icon v-else-if="store.isPlaying"><VideoPause /></el-icon>
            <el-icon v-else><VideoPlay /></el-icon>
          </el-button>

          <el-button circle size="small" link @click.stop="store.next">
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>

        <!-- Playlist & Close -->
        <div class="player-actions">
           <el-button circle link @click.stop="togglePlaylist">
              <el-icon><List /></el-icon>
           </el-button>
           
           <el-button circle link @click.stop="toggleMinimize">
             <el-icon><Close /></el-icon>
           </el-button>
        </div>

        <!-- Custom Playlist Panel -->
        <transition name="playlist-fade">
          <div v-if="showPlaylist" class="custom-playlist-panel" @click.stop ref="playlistRef">
             <div class="playlist-header">
                <span>播放列表 ({{ store.playlist.length }})</span>
                <el-button link type="primary" size="small" @click="store.playlist = []" v-if="store.playlist.length">清空</el-button>
             </div>
             <div class="playlist-scroll">
               <div 
                  v-for="track in store.playlist" 
                  :key="track.id" 
                  class="playlist-item"
                  :class="{ active: store.currentTrack?.id === track.id }"
                  @click="store.playTrack(track)"
               >
                  <div class="playlist-info">
                     <div class="playlist-name">{{ track.name }}</div>
                     <div class="playlist-artist">{{ getArtistName(track) }}</div>
                  </div>
                  <el-icon v-if="store.currentTrack?.id === track.id" class="playing-icon"><VideoPlay /></el-icon>
               </div>
               <div v-if="store.playlist.length === 0" class="empty-playlist">
                  暂无歌曲
               </div>
             </div>
          </div>
        </transition>
      </div>
    </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted, onMounted } from 'vue';
import { usePlayerStore } from '../stores/player';
import { useRouter, useRoute } from 'vue-router';
import { VideoPlay, VideoPause, ArrowLeft, ArrowRight, Close, Headset, Loading, List } from '@element-plus/icons-vue';

const store = usePlayerStore();
const router = useRouter();
const route = useRoute();
const isDragging = ref(false);
const currentTimeSync = ref(0);
const volumeSync = ref(0.5);
const isMinimized = ref(false);
const footerOverlap = ref(0);
const playerRef = ref<HTMLElement | null>(null);
const playlistRef = ref<HTMLElement | null>(null);
const isMobile = ref(false);
const showPlaylist = ref(false);

const getArtistName = (song: any) => (song.ar || song.artists || []).map((a: any) => a.name).join(', ');

const togglePlaylist = () => {
  showPlaylist.value = !showPlaylist.value;
};

// Mask handles click outside
/* const closePlaylist = (e: MouseEvent) => {
  if (showPlaylist.value) {
    const target = e.target as HTMLElement;
    // Check if click is inside playlist
    const playlistEl = playlistRef.value;
    if (playlistEl && !playlistEl.contains(target)) {
      showPlaylist.value = false;
    }
  }
}; */

watch(() => store.showPlayer && store.currentTrack, async () => {
  // Reset minimized state when track changes or player shows up
  nextTick(checkFooterOverlap);
}, { immediate: true });

const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768;
};

const toggleMinimize = () => {
  isMinimized.value = !isMinimized.value;
};

const handlePlayerClick = () => {
  if (showPlaylist.value) {
    showPlaylist.value = false;
    return;
  }
  if (isMinimized.value) {
    toggleMinimize();
  } else if (route.path !== '/music') {
    router.push('/music');
  }
};

const checkFooterOverlap = () => {
  const footer = document.querySelector('.footer');
  if (!footer) return;
  
  const footerRect = footer.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  
  if (footerRect.top < viewportHeight) {
    // Footer is visible in viewport
    const footerVisibleHeight = viewportHeight - footerRect.top;
    // Add padding (10px for mobile, 20px for desktop)
    const padding = isMobile.value ? 12 : 20;
    const newOverlap = footerVisibleHeight > 0 ? footerVisibleHeight + padding : 0;
    
    if (footerOverlap.value !== newOverlap) {
      footerOverlap.value = newOverlap;
    }
  } else {
    // Footer is not visible
    footerOverlap.value = 0;
  }
};

onMounted(() => {
  window.addEventListener('scroll', checkFooterOverlap);
  window.addEventListener('resize', checkFooterOverlap);
  window.addEventListener('resize', checkMobile);
  // window.addEventListener('click', closePlaylist);
  checkMobile();
  // Initial check
  nextTick(checkFooterOverlap);
});

onUnmounted(() => {
  window.removeEventListener('scroll', checkFooterOverlap);
  window.removeEventListener('resize', checkFooterOverlap);
  window.removeEventListener('resize', checkMobile);
  // window.removeEventListener('click', closePlaylist);
});

const playerStyle = computed(() => {
  // Mobile default bottom: 30px (close to bottom edge)
  // Desktop default bottom: 30px
  const baseBottom = isMobile.value ? 30 : 30;
  let bottomVal = baseBottom;
  
  // If footer overlaps, we lift it up
  if (footerOverlap.value > 0) {
    if (footerOverlap.value > baseBottom) {
        bottomVal = footerOverlap.value;
    }
  }
  
  // Safety cap: ensure player doesn't go off-screen (top)
  // Assuming player height is around 80px + margin
  // Keep at least 60px (header) + 20px from top
  const maxBottom = window.innerHeight - 100;
  if (bottomVal > maxBottom) {
      bottomVal = maxBottom;
  }

  return {
    bottom: `${bottomVal}px`
  };
});

// Sync slider with store time
watch(() => store.currentTime, (val) => {
  if (!isDragging.value) {
    currentTimeSync.value = val;
  }
});

watch(() => store.volume, (val) => {
    volumeSync.value = val;
});

// Custom Progress Bar Logic
const progressPercentage = computed(() => {
  if (isDragging.value) {
    return (currentTimeSync.value / (store.duration || 1)) * 100;
  }
  return (store.currentTime / (store.duration || 1)) * 100;
});

const handleProgressClick = (e: MouseEvent) => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = e.clientX - rect.left;
  const percentage = Math.max(0, Math.min(1, x / rect.width));
  const time = percentage * (store.duration || 0);
  store.seek(time);
};

const handleProgressHover = (e: MouseEvent) => {
  if (e.buttons === 1) { // Left click held down
     isDragging.value = true;
     const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
     const x = e.clientX - rect.left;
     const percentage = Math.max(0, Math.min(1, x / rect.width));
     currentTimeSync.value = percentage * (store.duration || 0);
  }
};

const handleProgressLeave = () => {
  if (isDragging.value) {
    store.seek(currentTimeSync.value);
    isDragging.value = false;
  }
};

const coverUrl = computed(() => {
  const t = store.currentTrack;
  if (!t) return '';
  return t.picUrl || t.al?.picUrl || t.album?.picUrl || '';
});

const artistName = computed(() => {
  const t = store.currentTrack;
  if (!t) return 'Unknown';
  if (t.ar) return t.ar.map(a => a.name).join(', ');
  if (t.artists) return t.artists.map(a => a.name).join(', ');
  return 'Unknown';
});

</script>

<style>
.custom-playlist-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 12px;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  max-height: 400px;
  z-index: 999;
  backdrop-filter: blur(10px);
  overflow: hidden;
}

.playlist-fade-enter-active,
.playlist-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.playlist-fade-enter-from,
.playlist-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.playlist-popper {
  padding: 0 !important;
}
.playlist-container {
  display: flex;
  flex-direction: column;
  max-height: 400px;
}
.playlist-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
}
.playlist-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}
.playlist-scroll::-webkit-scrollbar {
  display: none; /* Chrome/Safari/Webkit */
}
.playlist-item {
  padding: 8px 16px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background-color 0.2s;
}
.playlist-item:hover {
  background-color: var(--el-fill-color-light);
}
.playlist-item.active {
  color: var(--el-color-primary);
}
.playlist-info {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}
.playlist-name {
  font-size: 13px;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.playlist-artist {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.playlist-item.active .playlist-artist {
  color: var(--el-color-primary-light-3);
}
.empty-playlist {
  padding: 32px 0;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>

<style scoped>
.mini-player {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 600px;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  padding: 10px 20px;
  z-index: 2001; /* Above mask */
  backdrop-filter: blur(10px);
  user-select: none;
  transition: width 0.3s ease, height 0.3s ease, border-radius 0.3s ease, left 0.3s ease, bottom 0.3s ease, transform 0.3s ease;
}

.playlist-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 2000;
  background: transparent;
}

.mini-player.minimized {
  width: 80px;
  height: 80px;
  padding: 0;
  border-radius: 12px;
  left: auto !important;
  right: 20px;
  transform: translateX(0);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  overflow: hidden;
}

@media (max-width: 768px) {
  .mini-player {
    width: 90% !important;
    /* bottom is controlled by style binding now */
    left: 50% !important;
    transform: translateX(-50%) !important;
    max-width: 380px;
    padding: 8px 15px;
  }

  .mini-player.minimized {
    width: 60px !important;
    height: 60px !important;
    left: auto !important;
    right: 15px !important;
    /* bottom is controlled by style binding now */
    transform: none !important;
    border-radius: 12px;
  }

  .player-content {
    gap: 10px;
  }

  .track-cover {
    width: 36px;
    height: 36px;
  }

  .track-name {
    font-size: 13px;
  }

  .track-artist {
    font-size: 11px;
  }

  .player-controls {
    gap: 5px;
  }
  
  .play-btn {
    width: 32px;
    height: 32px;
  }
}

.minimized-content {
  width: 100%;
  height: 100%;
  cursor: pointer;
  position: relative;
}

.minimized-cover {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  opacity: 1;
  transition: opacity 0.3s;
}

.restore-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  color: white;
  opacity: 0;
  transition: opacity 0.3s;
  font-size: 24px;
}

.minimized-content:hover .restore-overlay {
  opacity: 1;
}

/* New Progress Bar Styles */
.progress-bar-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  cursor: pointer;
  z-index: 10;
  overflow: hidden;
  border-radius: 12px 12px 0 0;
}


.progress-handle {
  position: absolute;
  top: 50%;
  width: 0; /* Hidden by default */
  height: 0;
  background-color: var(--el-color-primary);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: left 0.1s linear;
}

.progress-bar-container:hover .progress-handle {
  width: 10px;
  height: 10px;
}

.progress-bar-container:hover {
  height: 8px;
}

.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.player-content {
  display: flex;
  align-items: center;
  gap: 15px;
}

.track-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0; /* Enable ellipsis */
}

.track-cover {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background: var(--el-fill-color-darker);
  flex-shrink: 0;
}

.track-text {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.track-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--el-text-color-primary);
}

.track-artist {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.player-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 2;
}

.progress-slider {
  flex: 1;
}

.time-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  min-width: 35px;
}

.player-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.image-slot {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  color: var(--el-text-color-secondary);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Water Fill Styles */
.water-fill-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  z-index: -1;
  pointer-events: none;
}

.water-fill {
  height: 100%;
  background: linear-gradient(to right, var(--el-color-primary-light-9) 0%, var(--el-color-primary-light-8) 100%);
  position: relative;
  transition: width 0.1s linear;
}

.water-wave {
  position: absolute;
  top: 0;
  right: -2px;
  width: 4px;
  height: 100%;
  background: var(--el-color-primary-light-5);
  box-shadow: 0 0 8px var(--el-color-primary-light-3);
  opacity: 0.6;
}
</style>
