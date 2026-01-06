import { defineStore } from 'pinia';
import { ref } from 'vue';
import { proxyRequest } from '../services/api';
import { ElMessage } from 'element-plus';

export interface Track {
  id: number;
  name: string;
  ar?: { id: number; name: string }[]; // Search result format
  artists?: { id: number; name: string }[]; // Detail format
  al?: { id: number; name: string; picUrl: string }; // Search result format
  album?: { id: number; name: string; picUrl: string }; // Detail format
  dt?: number; // Duration
  duration?: number;
  picUrl?: string; // Sometimes directly on track
}

export const usePlayerStore = defineStore('player', () => {
  const currentTrack = ref<Track | null>(null);
  const playlist = ref<Track[]>([]);
  const currentIndex = ref(-1);
  const isPlaying = ref(false);
  const showPlayer = ref(false);
  const volume = ref(0.5);
  const currentTime = ref(0);
  const duration = ref(0);
  const audioUrl = ref('');
  const loading = ref(false);
  const apiUrl = ref('');
  const cookie = ref('');

  // HTML Audio Element
  const audio = new Audio();
  audio.volume = volume.value;

  // Sync state with audio events
  audio.ontimeupdate = () => {
    currentTime.value = audio.currentTime;
  };
  audio.onloadedmetadata = () => {
    duration.value = audio.duration;
  };
  audio.onended = () => {
    isPlaying.value = false;
    next();
  };
  audio.onplay = () => isPlaying.value = true;
  audio.onpause = () => isPlaying.value = false;
  audio.onwaiting = () => loading.value = true;
  audio.onplaying = () => {
    loading.value = false;
    isPlaying.value = true;
  };
  audio.onerror = (e) => {
    console.error('Audio error', e);
    isPlaying.value = false;
    loading.value = false;
    ElMessage.error('播放出错');
  };

  const setApiUrl = (url: string) => {
    apiUrl.value = url;
  };

  const setCookie = (c: string) => {
    cookie.value = c;
  };

  const playTrack = async (track: Track, list?: Track[]) => {
    if (list) {
      playlist.value = [...list];
      currentIndex.value = list.findIndex(t => t.id === track.id);
    } else if (currentIndex.value === -1 || playlist.value[currentIndex.value]?.id !== track.id) {
       // If playing a single track not in list, or just replacing current
       playlist.value = [track];
       currentIndex.value = 0;
    }

    currentTrack.value = track;
    showPlayer.value = true;
    loading.value = true;
    
    // Reset audio
    audio.pause();
    audioUrl.value = '';
    
    try {
        if (!apiUrl.value) {
            throw new Error('API URL not set');
        }

        let baseUrl = apiUrl.value.trim();
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

        const headers = cookie.value ? { Cookie: cookie.value } : {};
        // Netease Song URL API
        // Standard: /song/url?id=xxx
        // New: /song/url/v1?id=xxx&level=standard
        const res = await proxyRequest(`${baseUrl}/song/url?id=${track.id}`, 'GET', headers, {});
        
        if (res.data?.data && res.data.data.length > 0) {
            const url = res.data.data[0].url;
            if (url) {
                audioUrl.value = url;
                audio.src = url;

                // Check for cover image if missing
                if (!track.picUrl && !track.al?.picUrl && !track.album?.picUrl) {
                   try {
                       const detailRes = await proxyRequest(`${baseUrl}/song/detail?ids=${track.id}`, 'GET', headers, {});
                       if (detailRes.data?.songs && detailRes.data.songs.length > 0) {
                           const songDetail = detailRes.data.songs[0];
                           if (songDetail.al?.picUrl) {
                               // Update current track info with cover
                               if (currentTrack.value && currentTrack.value.id === track.id) {
                                   currentTrack.value = {
                                       ...currentTrack.value,
                                       al: songDetail.al,
                                       picUrl: songDetail.al.picUrl
                                   };
                               }
                           }
                       }
                   } catch (e) {
                       console.warn('Failed to fetch song detail for cover', e);
                   }
                }

                audio.play().catch(e => {
                    console.error('Play failed', e);
                    ElMessage.error('无法自动播放');
                });
            } else {
                ElMessage.warning('无法获取歌曲链接 (可能需要VIP)');
                next(); // Skip if fails
            }
        } else {
             ElMessage.warning('获取歌曲链接失败');
        }
    } catch (e) {
        console.error('Failed to get song url', e);
        ElMessage.error('播放失败');
    } finally {
        loading.value = false;
    }
  };

  const togglePlay = () => {
    if (audio.paused) {
        if (audio.src) audio.play();
    } else {
        audio.pause();
    }
  };

  const seek = (time: number) => {
    audio.currentTime = time;
  };

  const setVolume = (val: number) => {
    volume.value = val;
    audio.volume = val;
  };

  const prev = () => {
    if (playlist.value.length <= 1) return;
    let nextIndex = currentIndex.value - 1;
    if (nextIndex < 0) nextIndex = playlist.value.length - 1;
    playTrack(playlist.value[nextIndex]);
  };

  const next = () => {
    if (playlist.value.length <= 1) return;
    let nextIndex = currentIndex.value + 1;
    if (nextIndex >= playlist.value.length) nextIndex = 0;
    playTrack(playlist.value[nextIndex]);
  };

  const addToQueue = (track: Track) => {
      if (!playlist.value.some(t => t.id === track.id)) {
          playlist.value.push(track);
          ElMessage.success('已添加到播放列表');
      }
  };

  return {
    currentTrack,
    playlist,
    currentIndex,
    isPlaying,
    showPlayer,
    volume,
    currentTime,
    duration,
    loading,
    setApiUrl,
    setCookie,
    playTrack,
    togglePlay,
    seek,
    setVolume,
    prev,
    next,
    addToQueue
  };
});
