import axios from 'axios';

// Use same-origin relative base URL; Nginx/BT 反向代理到后端
const API_URL = '/api';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
    if (pageSize) params.limit = pageSize;
    if (filters?.location) params.location = filters.location;
    if (filters?.device) params.device = filters.device;
    
    const response = await apiClient.get('/visitors', { params });
    const visitors: Visitor[] = response.data.visitors || [];
    const total: number = typeof response.data.total === 'number' ? response.data.total : visitors.length;
    return {
      visitors,
      total,
      uniqueIp: typeof response.data.unique_ip === 'number' ? response.data.unique_ip : response.data.uniqueIp,
      locationKinds: typeof response.data.location_kinds === 'number' ? response.data.location_kinds : response.data.locationKinds,
      deviceKinds: typeof response.data.device_kinds === 'number' ? response.data.device_kinds : response.data.deviceKinds,
      locationStats: Array.isArray(response.data.location_stats) ? response.data.location_stats : response.data.locationStats,
      deviceStats: Array.isArray(response.data.device_stats) ? response.data.device_stats : response.data.deviceStats,
    };
  } catch (error) {
    console.error('Failed to fetch visitor stats', error);
    return { visitors: [], total: 0 };
  }
};

export const deleteVisitors = async (ids: number[]): Promise<boolean> => {
  try {
    const token = localStorage.getItem('token');
    await apiClient.post('/visitors/batch-delete', { ids }, {
      headers: { Authorization: token ? `Bearer ${token}` : '' }
    });
    return true;
  } catch (error) {
    console.error('Failed to delete visitors', error);
    throw error;
  }
};

export interface VisitorTrendItem {
  date: string;
  count: number;
  unique_ip: number;
}

export const getVisitorTrend = async (days = 30): Promise<VisitorTrendItem[]> => {
  try {
    const token = localStorage.getItem('token');
    const response = await apiClient.get('/visitors/trend', {
      params: { days },
      headers: { Authorization: token ? `Bearer ${token}` : '' }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch visitor trend', error);
    return [];
  }
};

export const exportVisitorLogs = async () => {
  const token = localStorage.getItem('token');
  const response = await apiClient.get('/visitors/export', {
    responseType: 'blob',
    headers: { Authorization: token ? `Bearer ${token}` : '' }
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  const contentDisposition = response.headers['content-disposition'];
  let fileName = 'visitors.csv';
  if (contentDisposition) {
    const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/);
    if (fileNameMatch && fileNameMatch.length === 2) fileName = fileNameMatch[1];
  }
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const proxyRequest = async (url: string, method: string, headers: any, body: any) => {
  try {
    const response = await apiClient.post('/proxy-request', {
      url,
      method,
      headers,
      body
    });
    return response.data;
  } catch (error: any) {
    console.error('Proxy request failed', error);
    return {
      status: 0,
      statusText: 'Error',
      error: error.message || 'Network Error',
      duration: 0
    };
  }
};

export interface Changelog {
  id: number;
  version: string;
  content_html: string;
  content_markdown?: string;
  release_date: string;
  created_at: string;
  updated_at: string;
}

export const getPublicChangelogs = async (): Promise<Changelog[]> => {
  try {
    const response = await apiClient.get('/public/changelogs');
    return response.data.items;
  } catch (error) {
    console.error('Failed to fetch changelogs', error);
    return [];
  }
};

export interface AboutPageData {
  id?: number;
  content_html?: string;
  content_markdown?: string;
  author_name?: string;
  author_avatar?: string;
  author_github?: string;
  github_repo?: string;
  version?: string;
  updated_at?: string;
}

export const getAboutPage = async (): Promise<AboutPageData> => {
  try {
    const response = await apiClient.get('/about');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch about page', error);
    return {};
  }
};

export const updateAboutPage = async (data: AboutPageData): Promise<any> => {
  const token = localStorage.getItem('token');
  const response = await apiClient.put('/about', data, {
    headers: { Authorization: token ? `Bearer ${token}` : '' }
  });
  return response.data;
};

export const uploadFile = async (file: File): Promise<string> => {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post('/upload', formData, {
    headers: { 
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data.url;
};
