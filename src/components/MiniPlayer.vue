<template>
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
        <!-- Progress Bar at Top -->
        <div class="progress-bar-container" 
             @click.stop="handleProgressClick"
             @mousemove="handleProgressHover"
             @mouseleave="handleProgressLeave"
        >
           <div class="progress-bg"></div>
           <div class="progress-fill" :style="{ width: `${progressPercentage}%` }"></div>
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
          <el-button circle size="small" link @click="store.prev">
            <el-icon><ArrowLeft /></el-icon>
          </el-button>
          
          <el-button circle type="primary" class="play-btn" @click.stop="store.togglePlay" :loading="false">
            <el-icon v-if="store.loading" class="is-loading"><Loading /></el-icon>
            <el-icon v-else-if="store.isPlaying"><VideoPause /></el-icon>
            <el-icon v-else><VideoPlay /></el-icon>
          </el-button>

          <el-button circle size="small" link @click="store.next">
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>

        <!-- Volume & Close -->
        <div class="player-actions">
           <el-popover placement="top" :width="200" trigger="click">
              <template #reference>
                <el-button circle link>
                   <el-icon><Headset /></el-icon>
                </el-button>
              </template>
              <div class="volume-control">
                 <span>音量</span>
                 <el-slider v-model="volumeSync" :max="1" :step="0.01" @input="store.setVolume" />
              </div>
           </el-popover>
           
           <el-button circle link @click.stop="toggleMinimize">
             <el-icon><Close /></el-icon>
           </el-button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted, onMounted } from 'vue';
import { usePlayerStore } from '../stores/player';
import { VideoPlay, VideoPause, ArrowLeft, ArrowRight, Close, Headset, Loading } from '@element-plus/icons-vue';

const store = usePlayerStore();
const isDragging = ref(false);
const currentTimeSync = ref(0);
const volumeSync = ref(0.5);
const isMinimized = ref(false);
const footerOverlap = ref(0);
const playerRef = ref<HTMLElement | null>(null);

watch(() => store.showPlayer && store.currentTrack, async () => {
  // Reset minimized state when track changes or player shows up
}, { immediate: true });

const toggleMinimize = () => {
  isMinimized.value = !isMinimized.value;
};

const handlePlayerClick = () => {
  if (isMinimized.value) {
    toggleMinimize();
  }
};

const checkFooterOverlap = () => {
  const footer = document.querySelector('.footer');
  if (!footer) return;
  
  const footerRect = footer.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  
  if (footerRect.top < viewportHeight) {
    // Footer is visible
    if (playerRef.value) {
       const footerVisibleHeight = viewportHeight - footerRect.top;
       // Add 20px padding
       const newOverlap = footerVisibleHeight > 0 ? footerVisibleHeight + 20 : 0;
       
       if (footerOverlap.value !== newOverlap) {
         footerOverlap.value = newOverlap;
       }
    }
  } else {
    footerOverlap.value = 0;
  }
};

onMounted(() => {
  window.addEventListener('scroll', checkFooterOverlap);
  window.addEventListener('resize', checkFooterOverlap);
  // Initial check
  nextTick(checkFooterOverlap);
});

onUnmounted(() => {
  window.removeEventListener('scroll', checkFooterOverlap);
  window.removeEventListener('resize', checkFooterOverlap);
});

const playerStyle = computed(() => {
  let bottomVal = 20;
  if (footerOverlap.value > 20) {
    bottomVal = footerOverlap.value;
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
  z-index: 2000;
  backdrop-filter: blur(10px);
  user-select: none;
  transition: width 0.3s ease, height 0.3s ease, border-radius 0.3s ease, left 0.3s ease, bottom 0.3s ease, transform 0.3s ease;
  overflow: hidden;
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
}

.progress-bg {
  width: 100%;
  height: 100%;
  background-color: var(--el-border-color-lighter);
}

.progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background-color: var(--el-color-primary);
  transition: width 0.1s linear;
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

@media (max-width: 768px) {
  .player-content {
    flex-wrap: wrap;
    justify-content: space-between;
  }
  
  .player-progress {
    order: 3;
    width: 100%;
    flex: 0 0 100%;
    margin-top: 10px;
    padding-bottom: 5px;
  }
  
  .track-info {
    max-width: 50%;
  }

  .mini-player {
    bottom: 10px;
    width: 95%;
  }
}
</style>
