<template>
  <div class="login-page">
    <div class="login-box">
      <div class="login-brand">
        <span class="brand-icon">🎬</span>
        <h1>NexaPlayer</h1>
        <p>管理后台</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        size="large"
        class="login-form"
        @submit.prevent
      >
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入管理员密码"
            show-password
            :prefix-icon="Lock"
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            :loading="loading"
            style="width: 100%"
            @click="handleSubmit"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-footer">NexaPlayer 管理后台 · {{ currentYear }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth   = useAuthStore()

const formRef   = ref()
const loading   = ref(false)
const currentYear = new Date().getFullYear()

const form = reactive({ password: '' })
const rules = {
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleSubmit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await auth.login(form.password)
    router.push('/dashboard/app-config')
  } catch (e) {
    ElMessage.error(e.message || '登录失败')
    form.password = ''
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: var(--np-bg-base);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-box {
  width: 100%;
  max-width: 400px;
  background: var(--np-bg-card);
  border: 1px solid var(--np-border);
  border-radius: 16px;
  padding: 44px 36px 32px;
}

.login-brand {
  text-align: center;
  margin-bottom: 36px;
}
.brand-icon { font-size: 48px; line-height: 1; display: block; margin-bottom: 12px; }
.login-brand h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--np-text-1);
  margin-bottom: 4px;
}
.login-brand p {
  font-size: 14px;
  color: var(--np-text-3);
}

.login-footer {
  text-align: center;
  font-size: 12px;
  color: var(--np-text-3);
  margin-top: 24px;
}
</style>
