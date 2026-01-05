import { createRouter, createWebHistory } from 'vue-router';
const HomeView = () => import('../views/HomeView.vue');
const DetailView = () => import('../views/DetailView.vue');
const AppsView = () => import('../views/AppsView.vue');
const AboutView = () => import('../views/AboutView.vue');
const FriendLinksView = () => import('../views/admin/FriendLinksView.vue');
const GroupChatsView = () => import('../views/admin/GroupChatsView.vue');
const AppsAdminView = () => import('../views/admin/AppsAdminView.vue');
const AnnouncementsView = () => import('../views/admin/AnnouncementsView.vue');
const EnvManagerView = () => import('../views/admin/EnvManagerView.vue');
const SystemLogsView = () => import('../views/admin/SystemLogsView.vue');
const IncidentsAdminView = () => import('../views/admin/IncidentsAdminView.vue');
const AdminDashboardView = () => import('../views/admin/AdminDashboardView.vue');
const LoginView = () => import('../views/LoginView.vue');
const NotFoundView = () => import('../views/NotFoundView.vue');
import { useAuthStore } from '../stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/apps',
      name: 'apps',
      component: AppsView,
    },
    {
      path: '/about',
      name: 'about',
      component: AboutView,
    },
    {
      path: '/monitor/:id',
      name: 'monitor-detail',
      component: DetailView,
      props: true,
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminDashboardView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/links',
      name: 'admin-links',
      component: FriendLinksView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/groups',
      name: 'admin-groups',
      component: GroupChatsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/apps',
      name: 'admin-apps',
      component: AppsAdminView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/announcements',
      name: 'admin-announcements',
      component: AnnouncementsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/env',
      name: 'admin-env',
      component: EnvManagerView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/logs',
      name: 'admin-logs',
      component: SystemLogsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/incidents',
      name: 'admin-incidents',
      component: IncidentsAdminView,
      meta: { requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0 };
    }
  },
});

router.beforeEach((to) => {
  const store = useAuthStore();
  if (to.meta && (to.meta as any).requiresAuth && !store.isLoggedIn()) {
    return { name: 'login' };
  }
});

export default router;
