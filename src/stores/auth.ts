import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const isLoggedIn = () => !!token.value;
  const setToken = (t: string) => { token.value = t; localStorage.setItem('token', t); };
  const logout = () => { token.value = null; localStorage.removeItem('token'); };
  return { token, isLoggedIn, setToken, logout };
});

