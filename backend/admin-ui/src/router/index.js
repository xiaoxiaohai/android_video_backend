import { createRouter, createWebHashHistory } from 'vue-router'
import { TOKEN_KEY } from '@/api'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/dashboard/app-config',
    },
    {
      path: '/login',
      component: () => import('@/views/Login.vue'),
      meta: { public: true },
    },
    {
      path: '/dashboard',
      component: () => import('@/views/Layout.vue'),
      redirect: '/dashboard/app-config',
      children: [
        {
          path: 'app-config',
          component: () => import('@/views/AppConfig.vue'),
          meta: { title: '应用升级配置' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard/app-config' },
  ],
})

router.beforeEach((to) => {
  const hasToken = !!localStorage.getItem(TOKEN_KEY)
  if (!to.meta.public && !hasToken) return '/login'
  if (to.path === '/login' && hasToken) return '/dashboard/app-config'
})

export default router
