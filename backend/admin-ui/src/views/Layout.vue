<template>
  <el-container class="layout">

    <!-- ── Sidebar ── -->
    <el-aside class="sidebar" :width="sidebarCollapsed ? '64px' : '220px'">
      <div class="sidebar-logo" :class="{ collapsed: sidebarCollapsed }">
        <span class="logo-icon">🎬</span>
        <span v-show="!sidebarCollapsed" class="logo-text">NexaPlayer</span>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="sidebarCollapsed"
        :collapse-transition="false"
        class="sidebar-menu"
        router
      >
        <el-sub-menu index="app">
          <template #title>
            <el-icon><Cellphone /></el-icon>
            <span>应用</span>
          </template>
          <el-menu-item index="/dashboard/app-config">
            <el-icon><Upload /></el-icon>
            <span>升级配置</span>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>

      <div class="sidebar-bottom">
        <el-tooltip content="收起/展开侧边栏" placement="right" :disabled="false">
          <button class="collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed">
            <el-icon>
              <ArrowLeft v-if="!sidebarCollapsed" />
              <ArrowRight v-else />
            </el-icon>
          </button>
        </el-tooltip>
      </div>
    </el-aside>

    <!-- ── Main ── -->
    <el-container direction="vertical" class="main-container">

      <!-- Header -->
      <el-header class="header">
        <div class="header-left">
          <span class="page-title">{{ currentTitle }}</span>
        </div>
        <div class="header-right">
          <el-tooltip content="退出登录" placement="bottom">
            <el-button circle @click="handleLogout">
              <el-icon><SwitchButton /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </el-header>

      <!-- Page content -->
      <el-main class="main">
        <RouterView />
      </el-main>

    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()

const sidebarCollapsed = ref(false)

const activeMenu   = computed(() => route.path)
const currentTitle = computed(() => route.meta?.title ?? '管理后台')

async function handleLogout() {
  await ElMessageBox.confirm('确认退出管理后台吗？', '提示', {
    confirmButtonText: '退出',
    cancelButtonText:  '取消',
    type: 'warning',
  })
  auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.layout { height: 100vh; background: var(--np-bg-base); overflow: hidden; }

/* ── Sidebar ── */
.sidebar {
  background: var(--np-bg-surface);
  border-right: 1px solid var(--np-border);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  overflow: hidden;
}
.sidebar-logo {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  border-bottom: 1px solid var(--np-border);
  flex-shrink: 0;
}
.sidebar-logo.collapsed { justify-content: center; padding: 0; }
.logo-icon  { font-size: 22px; flex-shrink: 0; }
.logo-text  { font-size: 15px; font-weight: 700; color: var(--np-text-1); white-space: nowrap; }
.sidebar-menu { border: none; flex: 1; overflow-y: auto; overflow-x: hidden; }
.sidebar-bottom {
  border-top: 1px solid var(--np-border);
  padding: 12px;
  display: flex;
  justify-content: center;
}
.collapse-btn {
  background: transparent;
  border: 1px solid var(--np-border);
  border-radius: 8px;
  color: var(--np-text-3);
  cursor: pointer;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  transition: color 0.15s, border-color 0.15s;
}
.collapse-btn:hover { color: var(--np-accent); border-color: var(--np-accent); }

/* ── Header ── */
.header {
  height: 60px !important;
  background: var(--np-bg-surface);
  border-bottom: 1px solid var(--np-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
}
.page-title { font-size: 15px; font-weight: 600; color: var(--np-text-1); }
.header-right { display: flex; align-items: center; gap: 8px; }

/* ── Main ── */
.main-container { overflow: hidden; }
.main {
  background: var(--np-bg-base);
  overflow-y: auto;
  padding: 28px;
}
</style>
