import axios, { AxiosInstance, AxiosError } from 'axios';
import { getApiUrl } from '@/lib/api-url';

class ApiClient {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to attach JWT token
    this.api.interceptors.request.use((config) => {
      // Resolved per request, so it always matches the address the page was opened from.
      config.baseURL = getApiUrl();
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    });

    // Add response interceptor to handle token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        if (error.response?.status === 401 && !originalRequest._retry && typeof window !== 'undefined') {
          originalRequest._retry = true;

          try {
            const refresh_token = localStorage.getItem('refresh_token');
            if (!refresh_token) {
              throw new Error('No refresh token');
            }

            const response = await axios.post(`${getApiUrl()}/auth/refresh`, {
              refresh_token,
            });

            localStorage.setItem('access_token', response.data.access_token);

            // Retry original request
            originalRequest.headers.Authorization = `Bearer ${response.data.access_token}`;
            return this.api(originalRequest);
          } catch (err) {
            // Refresh failed, redirect to login
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user');
            window.location.href = '/auth/login';
            return Promise.reject(err);
          }
        }

        return Promise.reject(error);
      },
    );
  }

  // Auth endpoints
  async signup(data: any) {
    return this.api.post('/auth/signup', data);
  }

  async login(data: any) {
    return this.api.post('/auth/login', data);
  }

  async logout(refresh_token: string) {
    return this.api.post('/auth/logout', { refresh_token });
  }

  async getProfile() {
    return this.api.post('/auth/me');
  }

  // Generic GET/POST/PUT/DELETE methods
  get(url: string, config?: any) {
    return this.api.get(url, config);
  }

  post(url: string, data?: any, config?: any) {
    return this.api.post(url, data, config);
  }

  put(url: string, data?: any, config?: any) {
    return this.api.put(url, data, config);
  }

  patch(url: string, data?: any, config?: any) {
    return this.api.patch(url, data, config);
  }

  delete(url: string, config?: any) {
    return this.api.delete(url, config);
  }
}

export const apiClient = new ApiClient();
