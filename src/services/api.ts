import axios from 'axios';

// Use same-origin relative base URL; Nginx/BT 反向代理到后端
const API_URL = '/api';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercept requests to add token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Intercept 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // window.location.href = '/login'; // Do not redirect aggressively, let the page handle it
    }
    return Promise.reject(error);
  }
);

export interface Monitor {
  id: number;
  friendly_name: string;
  url: string;
  type: number;
  status: number; // 2: Up, 8: Seems Down, 9: Down, 0: Paused
  uptime_ratio: string;
  custom_uptime_ratio: string; // "100.00-99.98-99.50"
  custom_uptime_ranges?: string; // "100.00-100.00-..." (30 daily ranges)
  create_datetime: number; // Added for running time calculation
  response_times?: Array<{ datetime: number; value: number }>;
  logs?: Array<{ type: number; datetime: number; duration: number; reason: any }>;
  ssl?: {
    brand: string;
    product: string;
    expires: number;
  };
}

export interface Visitor {
  id: number;
  ip: string;
  location: string;
  device: string;
  timestamp: string;
}

export interface Incident {
  id: number;
  title: string;
  content?: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'scheduled';
  type: 'incident' | 'maintenance';
  start_time?: number;
  end_time?: number;
  created_at: number;
  updated_at: number;
}

export const getActiveIncidents = async (): Promise<Incident[]> => {
  try {
    const response = await apiClient.get('/public/incidents/active');
    return response.data.items || [];
  } catch (error) {
    console.error('Failed to fetch active incidents', error);
    return [];
  }
};

export const getMonitors = async (): Promise<Monitor[]> => {
  try {
    // Call local backend which proxies to UptimeRobot
    const response = await apiClient.get('/monitors');
    if (response.data.stat === 'ok') {
      return response.data.monitors;
    } else {
      throw new Error(response.data.error?.message || 'API Error');
    }
  } catch (error) {
    console.error('Failed to fetch monitors', error);
    throw error;
  }
};

export const getVisitors = async (): Promise<Visitor[]> => {
  try {
    const response = await apiClient.get('/visitors');
    return response.data.visitors;
  } catch (error) {
    console.error('Failed to fetch visitors', error);
    return [];
  }
};

export interface VisitorStats {
  visitors: Visitor[];
  total: number;
  uniqueIp?: number;
  locationKinds?: number;
  deviceKinds?: number;
  locationStats?: Array<{ name: string; count: number }>;
  deviceStats?: Array<{ name: string; count: number }>;
}

export const getVisitorStats = async (page?: number, pageSize?: number, filters?: { location?: string; device?: string }): Promise<VisitorStats> => {
  try {
    const params: any = {};
    if (page) params.page = page;
    if (pageSize) params.pageSize = pageSize;
    if (filters?.location) params.location = filters.location;
    if (filters?.device) params.device = filters.device;

    const response = await apiClient.get('/visitors', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch visitor stats', error);
    return { visitors: [], total: 0 };
  }
};

export const batchDeleteVisitors = async (ids: number[]): Promise<void> => {
  await apiClient.post('/visitors/batch-delete', { ids });
};

export const getVisitorTrend = async (days: number = 30): Promise<Array<{ date: string; count: number; unique_ip: number }>> => {
  const response = await apiClient.get('/visitors/trend', { params: { days } });
  return response.data;
};

export const exportVisitors = async (): Promise<void> => {
  const response = await apiClient.get('/visitors/export', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `visitors-${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
};

// Friend Links
export interface FriendLink {
  id: number;
  name: string;
  url: string;
  icon_url?: string;
  weight: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export const getFriendLinks = async (page: number = 1, pageSize: number = 10): Promise<{ items: FriendLink[]; total: number }> => {
  const response = await apiClient.get('/friend-links', { params: { page, pageSize } });
  return response.data;
};

export const getPublicFriendLinks = async (): Promise<FriendLink[]> => {
  const response = await apiClient.get('/public/friend-links');
  return response.data.items || [];
};

export const createFriendLink = async (data: Partial<FriendLink>): Promise<{ id: number }> => {
  const response = await apiClient.post('/friend-links', data);
  return response.data;
};

export const updateFriendLink = async (id: number, data: Partial<FriendLink>): Promise<void> => {
  await apiClient.put(`/friend-links/${id}`, data);
};

export const deleteFriendLink = async (id: number): Promise<void> => {
  await apiClient.delete(`/friend-links/${id}`);
};

// Group Chats
export interface GroupChat {
  id: number;
  name: string;
  link?: string;
  avatar_url?: string;
  enabled: number;
}
export const getGroupChats = async (): Promise<GroupChat[]> => {
  const response = await apiClient.get('/group-chats');
  return response.data.items || [];
};
export const getPublicGroupChats = async (): Promise<GroupChat[]> => {
  const response = await apiClient.get('/public/group-chats');
  return response.data.items || [];
};
export const createGroupChat = async (data: Partial<GroupChat>): Promise<{ id: number }> => {
  const response = await apiClient.post('/group-chats', data);
  return response.data;
};
export const updateGroupChat = async (id: number, data: Partial<GroupChat>): Promise<void> => {
  await apiClient.put(`/group-chats/${id}`, data);
};
export const deleteGroupChat = async (id: number): Promise<void> => {
  await apiClient.delete(`/group-chats/${id}`);
};

// Announcements
export interface Announcement {
  id: number;
  title: string;
  content_html?: string;
  content_markdown?: string;
  status: 'draft' | 'published' | 'offline';
  scheduled_at?: string;
  published_at?: string;
  updated_at?: string;
}
export const getAnnouncements = async (): Promise<Announcement[]> => {
  const response = await apiClient.get('/announcements');
  return response.data.items || [];
};
export const getPublicAnnouncements = async (): Promise<Announcement[]> => {
  const response = await apiClient.get('/public/announcements');
  return response.data.items || [];
};
export const createAnnouncement = async (data: Partial<Announcement>): Promise<{ id: number }> => {
  const response = await apiClient.post('/announcements', data);
  return response.data;
};
export const updateAnnouncement = async (id: number, data: Partial<Announcement>): Promise<void> => {
  await apiClient.put(`/announcements/${id}`, data);
};
export const deleteAnnouncement = async (id: number): Promise<void> => {
  await apiClient.delete(`/announcements/${id}`);
};
export const publishAnnouncement = async (id: number): Promise<void> => {
  await apiClient.post(`/announcements/${id}/publish`);
};
export const offlineAnnouncement = async (id: number): Promise<void> => {
  await apiClient.post(`/announcements/${id}/offline`);
};

// Changelogs
export interface Changelog {
  id: number;
  version: string;
  content_html?: string;
  content_markdown?: string;
  release_date: string;
  created_at: string;
}
export const getChangelogs = async (): Promise<Changelog[]> => {
  const response = await apiClient.get('/changelogs');
  return response.data.items || [];
};
export const getPublicChangelogs = async (): Promise<Changelog[]> => {
  const response = await apiClient.get('/public/changelogs');
  return response.data.items || [];
};
export const createChangelog = async (data: Partial<Changelog>): Promise<{ id: number }> => {
  const response = await apiClient.post('/changelogs', data);
  return response.data;
};
export const updateChangelog = async (id: number, data: Partial<Changelog>): Promise<void> => {
  await apiClient.put(`/changelogs/${id}`, data);
};
export const deleteChangelog = async (id: number): Promise<void> => {
  await apiClient.delete(`/changelogs/${id}`);
};

// Apps
export interface AppItem {
  id: number;
  name: string;
  provider?: string;
  bg_url?: string;
  download_url?: string;
  enabled: number;
}
export const getApps = async (): Promise<AppItem[]> => {
  const response = await apiClient.get('/apps');
  return response.data.items || [];
};
export const getPublicApps = async (): Promise<AppItem[]> => {
  const response = await apiClient.get('/public/apps');
  return response.data.items || [];
};
export const createApp = async (data: Partial<AppItem>): Promise<{ id: number }> => {
  const response = await apiClient.post('/apps', data);
  return response.data;
};
export const updateApp = async (id: number, data: Partial<AppItem>): Promise<void> => {
  await apiClient.put(`/apps/${id}`, data);
};
export const deleteApp = async (id: number): Promise<void> => {
  await apiClient.delete(`/apps/${id}`);
};

// Site Cards
export interface SiteCard {
  id: number;
  title: string;
  enabled: number;
  sort_order: number;
  style?: any;
}
export const getSiteCards = async (): Promise<SiteCard[]> => {
  const response = await apiClient.get('/site-cards');
  return response.data.items || [];
};
export const getPublicSiteCards = async (): Promise<SiteCard[]> => {
  const response = await apiClient.get('/public/site-cards');
  return response.data.items || [];
};
export const updateSiteCard = async (id: number, data: Partial<SiteCard>): Promise<void> => {
  await apiClient.put(`/site-cards/${id}`, data);
};

// About Page
export interface AboutPage {
  id: number;
  content_html?: string;
  content_markdown?: string;
  author_name?: string;
  author_avatar?: string;
  author_github?: string;
  github_repo?: string;
  version?: string;
}
export const getAboutPage = async (): Promise<AboutPage> => {
  const response = await apiClient.get('/about');
  return response.data || {};
};
export const updateAboutPage = async (data: Partial<AboutPage>): Promise<void> => {
  await apiClient.put('/about', data);
};

// Env Vars
export interface EnvVar {
  key: string;
  value?: string;
  secure?: boolean;
  category?: string;
  updated_at?: string;
}
export const getEnvVars = async (): Promise<Record<string, EnvVar[]>> => {
  const response = await apiClient.get('/env');
  return response.data;
};
export const setEnvVar = async (data: { key: string; value: string; secure?: boolean; category?: string }): Promise<void> => {
  await apiClient.put('/env', data);
};
export const getEnvHistory = async (key?: string): Promise<any[]> => {
  const response = await apiClient.get('/env/history', { params: { key } });
  return response.data.items;
};
export const rollbackEnvVar = async (id: number): Promise<void> => {
  await apiClient.post('/env/rollback', { id });
};

// Logs
export const getLogs = async (page: number = 1, pageSize: number = 20): Promise<{ items: any[]; total: number }> => {
  const response = await apiClient.get('/logs', { params: { page, pageSize } });
  return response.data;
};
export const batchDeleteLogs = async (ids: number[], clearAll: boolean = false): Promise<void> => {
  await apiClient.post('/logs/batch-delete', { ids, clearAll });
};

// Incidents Admin
export const getIncidents = async (): Promise<Incident[]> => {
  const response = await apiClient.get('/incidents');
  return response.data.items || [];
};
export const createIncident = async (data: Partial<Incident>): Promise<{ id: number }> => {
  const response = await apiClient.post('/incidents', data);
  return response.data;
};
export const updateIncident = async (id: number, data: Partial<Incident>): Promise<void> => {
  await apiClient.put(`/incidents/${id}`, data);
};
export const deleteIncident = async (id: number): Promise<void> => {
  await apiClient.delete(`/incidents/${id}`);
};

// Auth
export const login = async (username: string, password: string): Promise<{ token: string }> => {
  const response = await apiClient.post('/auth/login', { username, password });
  return response.data;
};
export const changePassword = async (data: any): Promise<void> => {
  await apiClient.post('/auth/change-password', data);
};

// Upload
export const uploadFile = async (file: File): Promise<{ url: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// Music APIs
export interface MusicApi {
  id: number;
  name: string;
  url: string;
  type: string;
  status: 'active' | 'error' | 'unknown';
  latency: number;
  enabled: number;
  created_at?: string;
  updated_at?: string;
}

export const getMusicApis = async (): Promise<MusicApi[]> => {
  try {
    const response = await apiClient.get('/music/apis');
    return response.data.items || [];
  } catch (error) {
    console.error('Failed to fetch music apis', error);
    return [];
  }
};

export const getAdminMusicApis = async (): Promise<MusicApi[]> => {
  const response = await apiClient.get('/admin/music/apis');
  return response.data.items || [];
};

export const createMusicApi = async (data: Partial<MusicApi>): Promise<{ id: number }> => {
  const response = await apiClient.post('/admin/music/apis', data);
  return response.data;
};

export const updateMusicApi = async (id: number, data: Partial<MusicApi>): Promise<void> => {
  await apiClient.put(`/admin/music/apis/${id}`, data);
};

export const deleteMusicApi = async (id: number): Promise<void> => {
  await apiClient.delete(`/admin/music/apis/${id}`);
};

export const checkMusicApi = async (id?: number): Promise<any> => {
  const response = await apiClient.post('/admin/music/apis/check', { id });
  return response.data;
};

export const proxyRequest = async (url: string, method: string = 'GET', headers: any = {}, data: any = null): Promise<any> => {
  try {
    const response = await apiClient.post('/proxy-request', {
      url,
      method,
      headers,
      data
    });
    return response.data;
  } catch (error) {
    console.error('Proxy request failed', error);
    throw error;
  }
};

export default apiClient;
