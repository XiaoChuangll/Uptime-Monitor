import axios from 'axios';
import { useAuthStore } from '../stores/auth';

const API_URL = '/api';

const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((config) => {
  const store = useAuthStore();
  if (store.token) {
    config.headers = config.headers || {};
    (config.headers as any)['Authorization'] = `Bearer ${store.token}`;
  }
  return config;
});

// Friend Links
export interface FriendLink {
  id: number;
  name: string;
  url: string;
  icon_url?: string | null;
  weight: number;
  enabled: number;
}

export const getFriendLinks = async (page = 1, pageSize = 10) => {
  const { data } = await api.get('/friend-links', { params: { page, pageSize } });
  return data as { items: FriendLink[]; total: number; page: number; pageSize: number };
};
export const createFriendLink = async (payload: Partial<FriendLink>) => {
  const { data } = await api.post('/friend-links', payload);
  return data.id as number;
};
export const updateFriendLink = async (id: number, payload: Partial<FriendLink>) => {
  await api.put(`/friend-links/${id}`, payload);
};
export const deleteFriendLink = async (id: number) => {
  await api.delete(`/friend-links/${id}`);
};
export const batchFriendLinks = async (ids: number[], action: 'enable' | 'disable' | 'delete') => {
  const { data } = await api.post('/friend-links/batch', { ids, action });
  return data;
};

// Group Chats
export interface GroupChat {
  id: number;
  name: string;
  link?: string;
  avatar_url?: string;
  enabled: number;
}
export const getGroupChats = async () => {
  const { data } = await api.get('/group-chats');
  return data.items as GroupChat[];
};
export const createGroupChat = async (payload: Partial<GroupChat>) => {
  const { data } = await api.post('/group-chats', payload);
  return data.id as number;
};
export const updateGroupChat = async (id: number, payload: Partial<GroupChat>) => {
  await api.put(`/group-chats/${id}`, payload);
};
export const deleteGroupChat = async (id: number) => {
  await api.delete(`/group-chats/${id}`);
};
export const uploadFile = async (file: File) => {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data.url as string;
};

// Announcements
export interface AnnouncementCategory { id: number; name: string; parent_id?: number | null; }
export interface Announcement {
  id: number;
  title: string;
  content_html: string;
  content_markdown?: string | null;
  status: 'draft' | 'published' | 'offline';
  category_id?: number | null;
  scheduled_at?: string | null;
}
export const getAnnouncementCategories = async () => {
  const { data } = await api.get('/announcement-categories');
  return data.items as AnnouncementCategory[];
};
export const createAnnouncementCategory = async (payload: Partial<AnnouncementCategory>) => {
  const { data } = await api.post('/announcement-categories', payload);
  return data.id as number;
};
export const updateAnnouncementCategory = async (id: number, payload: Partial<AnnouncementCategory>) => {
  await api.put(`/announcement-categories/${id}`, payload);
};
export const deleteAnnouncementCategory = async (id: number) => {
  await api.delete(`/announcement-categories/${id}`);
};

export const getAnnouncements = async (params: { status?: string; page?: number; pageSize?: number } = {}) => {
  const { data } = await api.get('/announcements', { params });
  return data as { items: Announcement[]; total: number; page: number; pageSize: number };
};
export const createAnnouncement = async (payload: Partial<Announcement>) => {
  const { data } = await api.post('/announcements', payload);
  return data.id as number;
};
export const updateAnnouncement = async (id: number, payload: Partial<Announcement>) => {
  await api.put(`/announcements/${id}`, payload);
};
export const deleteAnnouncement = async (id: number) => {
  await api.delete(`/announcements/${id}`);
};
export const publishAnnouncement = async (id: number) => {
  await api.post(`/announcements/${id}/publish`);
};
export const offlineAnnouncement = async (id: number) => {
  await api.post(`/announcements/${id}/offline`);
};

// Apps
export interface AppItem {
  id: number;
  name: string;
  provider?: string | null;
  bg_url?: string | null;
  icon_url?: string | null;
  download_url?: string | null;
  enabled: number;
}
export const getApps = async () => {
  const { data } = await api.get('/apps');
  return data.items as AppItem[];
};
export const createApp = async (payload: Partial<AppItem>) => {
  const { data } = await api.post('/apps', payload);
  return data.id as number;
};
export const updateApp = async (id: number, payload: Partial<AppItem>) => {
  await api.put(`/apps/${id}`, payload);
};
export const deleteApp = async (id: number) => {
  await api.delete(`/apps/${id}`);
};

// ENV management
export type EnvItem = { key: string; value: string; secure: boolean; updated_at: string | null };
export type EnvMap = Record<string, EnvItem[]>;

export const getEnvMap = async () => {
  const { data } = await api.get('/env');
  return data as EnvMap;
};
export const setEnv = async (payload: { key: string; value: string; category?: string; secure?: boolean }) => {
  await api.put('/env', payload);
};
export const getEnvHistory = async (key?: string) => {
  const { data } = await api.get('/env/history', { params: { key } });
  return data.items as Array<{ id: number; key: string; old_value_encrypted: string | null; new_value_encrypted: string; updated_at: string }>
};
export const rollbackEnvByHistoryId = async (id: number) => {
  await api.post('/env/rollback', { id });
};

// Public endpoints for homepage
export const getPublicFriendLinks = async () => {
  const { data } = await axios.get('/api/public/friend-links');
  return data.items as FriendLink[];
};
export const getPublicGroupChats = async () => {
  const { data } = await axios.get('/api/public/group-chats');
  return data.items as GroupChat[];
};
export const getPublicAnnouncements = async () => {
  const { data } = await axios.get('/api/public/announcements');
  return data.items as Announcement[];
};
export const getPublicApps = async () => {
  const { data } = await axios.get('/api/public/apps');
  return data.items as AppItem[];
};

// Auth
export const changeAdminPassword = async (payload: { old_password: string; new_password: string }) => {
  await api.post('/auth/change-password', payload);
};

// System Logs
export interface SystemLog {
  id: number;
  actor: string;
  action: string;
  entity: string;
  entity_id?: number | null;
  payload?: string | null;
  created_at: string;
}

export const getSystemLogs = async (page = 1, pageSize = 20) => {
  const { data } = await api.get('/logs', { params: { page, pageSize } });
  return data as { items: SystemLog[]; total: number; page: number; pageSize: number };
};

export const deleteSystemLogs = async (ids: number[], clearAll = false) => {
  await api.post('/logs/batch-delete', { ids, clearAll });
};

// Changelogs
import type { Changelog } from './api';
export const getChangelogs = async () => {
  const { data } = await api.get('/changelogs');
  return data.items as Changelog[];
};
export const createChangelog = async (payload: Partial<Changelog>) => {
  const { data } = await api.post('/changelogs', payload);
  return data.id as number;
};
export const updateChangelog = async (id: number, payload: Partial<Changelog>) => {
  await api.put(`/changelogs/${id}`, payload);
};
export const deleteChangelog = async (id: number) => {
  await api.delete(`/changelogs/${id}`);
};

// Site Cards
export interface SiteCard {
  id: number;
  key: string;
  title: string;
  enabled: number;
  sort_order: number;
  style: string; // JSON string
  updated_at?: string;
}

export const getSiteCards = async () => {
  const { data } = await api.get('/site-cards');
  return data.items as SiteCard[];
};

export const updateSiteCard = async (id: number, payload: Partial<SiteCard>) => {
  await api.put(`/site-cards/${id}`, payload);
};

export const getPublicSiteCards = async () => {
  const { data } = await axios.get('/api/public/site-cards');
  return data.items as SiteCard[];
};
