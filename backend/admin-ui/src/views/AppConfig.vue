<template>
  <div class="page">

    <!-- Page header -->
    <div class="page-header">
      <div>
        <h2 class="page-title">应用升级配置</h2>
        <p class="page-sub">管理 Android 用户看到的版本升级提示</p>
      </div>
      <div class="page-actions">
        <span v-if="savedAt" class="saved-hint">
          <el-icon><Check /></el-icon> 已保存 {{ savedAt }}
        </span>
        <el-button
          type="primary"
          :loading="saving"
          :icon="Upload"
          @click="handleSave"
        >
          保存更改
        </el-button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <el-icon class="is-loading" :size="36" color="var(--np-accent)"><Loading /></el-icon>
      <span>正在加载配置…</span>
    </div>

    <template v-else>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="config-form"
      >
        <el-row :gutter="20">

          <!-- LEFT COLUMN -->
          <el-col :xs="24" :lg="14">

            <!-- Version Info -->
            <el-card class="card" shadow="never">
              <template #header>
                <CardHeader icon="Cellphone" title="版本信息"
                  desc="设置当前已发布的最新版本" />
              </template>

              <el-row :gutter="16">
                <el-col :span="12">
                  <el-form-item label="版本名称" prop="latestVersionName">
                    <el-input v-model="form.latestVersionName" placeholder="例如 1.3.0"
                      clearable />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="版本号（Version Code）" prop="latestVersionCode">
                    <el-input-number
                      v-model="form.latestVersionCode"
                      :min="0" :controls="false"
                      style="width: 100%"
                      placeholder="例如 10300000"
                    />
                  </el-form-item>
                </el-col>
              </el-row>

              <!-- Version code helper table -->
              <el-collapse class="vc-help">
                <el-collapse-item title="Version Code 计算公式参考">
                  <p class="vc-formula">
                    <code>major × 10,000,000 + minor × 100,000 + patch × 1,000 + build</code>
                  </p>
                  <el-table :data="versionTable" size="small" style="margin-top: 10px">
                    <el-table-column prop="name" label="版本" width="90" />
                    <el-table-column prop="code" label="版本号" width="120" />
                    <el-table-column prop="note" label="" />
                  </el-table>
                </el-collapse-item>
              </el-collapse>
            </el-card>

            <!-- Force Update -->
            <el-card class="card" shadow="never">
              <template #header>
                <CardHeader icon="WarningFilled" title="强制更新"
                  desc="用户更新前不可继续使用应用">
                  <el-tag :type="forceUpdateEnabled ? 'danger' : 'info'" size="small">
                    {{ forceUpdateEnabled ? '已启用' : '已关闭' }}
                  </el-tag>
                </CardHeader>
              </template>

              <el-form-item label="最低要求版本号" prop="minRequiredVersionCode">
                <el-input-number
                  v-model="form.minRequiredVersionCode"
                  :min="0" :controls="false"
                  style="width: 240px"
                  placeholder="0 = 关闭"
                />
                <div class="field-hint">
                  版本号低于该值的用户会被强制更新。
                  设置为 <code>0</code> 可关闭。
                </div>
              </el-form-item>

              <el-form-item label="强制更新提示语" prop="forceUpdateMessage">
                <el-input
                  v-model="form.forceUpdateMessage"
                  type="textarea" :rows="2"
                  placeholder="留空则使用客户端默认提示语"
                />
              </el-form-item>
            </el-card>

            <!-- Optional Update -->
            <el-card class="card" shadow="never">
              <template #header>
                <CardHeader icon="Bell" title="可选更新"
                  desc="仅提醒更新，用户可稍后处理" />
              </template>

              <el-form-item label="可选更新提示语" prop="optionalUpdateMessage">
                <el-input
                  v-model="form.optionalUpdateMessage"
                  type="textarea" :rows="2"
                  placeholder="留空则使用客户端默认提示语"
                />
              </el-form-item>
            </el-card>

          </el-col>

          <!-- RIGHT COLUMN -->
          <el-col :xs="24" :lg="10">

            <!-- Update Link -->
            <el-card class="card" shadow="never">
              <template #header>
                <CardHeader icon="Link" title="升级链接"
                  desc="用户点击更新后跳转到的地址" />
              </template>

              <el-form-item label="Google Play 链接" prop="updateUrl">
                <el-input
                  v-model="form.updateUrl"
                  placeholder="https://play.google.com/store/apps/details?id=…"
                  clearable
                />
                <div class="field-hint">
                  留空会根据应用包名自动生成。
                  应用会始终优先尝试打开 Google Play。
                </div>
              </el-form-item>
            </el-card>

            <!-- Release Notes -->
            <el-card class="card" shadow="never">
              <template #header>
                <CardHeader icon="Document" title="更新说明"
                  desc="显示在升级弹窗中" />
              </template>

              <el-form-item label="说明内容（每行一条）" prop="releaseNotes">
                <el-input
                  v-model="form.releaseNotes"
                  type="textarea" :rows="8"
                  placeholder="修复若干问题并提升稳定性&#10;优化视频播放性能&#10;新增内容"
                />
              </el-form-item>
            </el-card>

            <!-- Streaming whitelist -->
            <el-card class="card" shadow="never">
              <template #header>
                <CardHeader icon="Document" title="Streaming 白名单"
                  desc="命中 hard_id 时 ss = true" />
              </template>

              <el-form-item label="hard_id 白名单（每行一个）" prop="streamingHardIdWhitelist">
                <el-input
                  v-model="form.streamingHardIdWhitelist"
                  type="textarea" :rows="6"
                  placeholder="例如&#10;9774d56d682e549c&#10;a1b2c3d4e5f60789"
                />
                <div class="field-hint">
                  客户端请求 <code>/api/app/config?hard_id=...</code> 时，若命中白名单，
                  返回 <code>ss: true</code>，否则为 <code>false</code>。
                </div>
              </el-form-item>
            </el-card>

            <!-- Live preview -->
            <el-card class="card" shadow="never">
              <template #header>
                <CardHeader icon="View" title="弹窗预览"
                  desc="设备端显示效果" />
              </template>

              <UpdatePreview :form="form" />
            </el-card>

          </el-col>
        </el-row>
      </el-form>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, Check } from '@element-plus/icons-vue'
import { api } from '@/api'
import CardHeader from '@/components/CardHeader.vue'
import UpdatePreview from '@/components/UpdatePreview.vue'

// ── State ──────────────────────────────────────────────────────────
const formRef  = ref()
const loading  = ref(true)
const saving   = ref(false)
const savedAt  = ref('')

const form = reactive({
  latestVersionCode:      0,
  latestVersionName:      '',
  minRequiredVersionCode: 0,
  updateUrl:              '',
  forceUpdateMessage:     '',
  optionalUpdateMessage:  '',
  releaseNotes:           '',
  streamingHardIdWhitelist: '',
})

const rules = {
  latestVersionCode:      [{ type: 'number', min: 0, trigger: 'change' }],
  minRequiredVersionCode: [{ type: 'number', min: 0, trigger: 'change' }],
}

// ── Computed ───────────────────────────────────────────────────────
const forceUpdateEnabled = computed(() => form.minRequiredVersionCode > 0)

const versionTable = [
  { name: '1.0.0', code: '10000000', note: '' },
  { name: '1.1.0', code: '10100000', note: '' },
  { name: '1.2.0', code: '10200000', note: '' },
  { name: '1.3.0', code: '10300000', note: '' },
  { name: '1.3.5 b12', code: '10305012', note: '补丁号 + 构建号' },
]

// ── Load ───────────────────────────────────────────────────────────
onMounted(loadConfig)

async function loadConfig() {
  loading.value = true
  try {
    const { config, updatedAt } = await api.getConfig()
    const a = config?.android ?? {}
    form.latestVersionCode      = a.latestVersionCode      ?? 0
    form.latestVersionName      = a.latestVersionName      ?? ''
    form.minRequiredVersionCode = a.minRequiredVersionCode ?? 0
    form.updateUrl              = a.updateUrl              ?? ''
    form.forceUpdateMessage     = a.forceUpdateMessage     ?? ''
    form.optionalUpdateMessage  = a.optionalUpdateMessage  ?? ''
    form.releaseNotes           = (a.releaseNotes ?? []).join('\n')
    form.streamingHardIdWhitelist = Array.isArray(a.streamingHardIdWhitelist)
      ? a.streamingHardIdWhitelist.join('\n')
      : ''
    if (updatedAt) savedAt.value = formatDate(updatedAt)
  } catch (e) {
    ElMessage.error(e.message || '加载配置失败')
  } finally {
    loading.value = false
  }
}

// ── Save ───────────────────────────────────────────────────────────
async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const releaseNotes = form.releaseNotes
      .split('\n').map(s => s.trim()).filter(Boolean)
    const streamingHardIdWhitelist = [...new Set(
      form.streamingHardIdWhitelist
        .split('\n')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
    )]

    await api.saveConfig({
      android: {
        latestVersionCode:      form.latestVersionCode,
        latestVersionName:      form.latestVersionName.trim(),
        minRequiredVersionCode: form.minRequiredVersionCode,
        updateUrl:              form.updateUrl.trim(),
        forceUpdateMessage:     form.forceUpdateMessage.trim()    || null,
        optionalUpdateMessage:  form.optionalUpdateMessage.trim() || null,
        releaseNotes,
        streamingHardIdWhitelist,
      },
    })

    savedAt.value = formatDate(new Date().toISOString())
    ElMessage.success('配置保存成功')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// ── Helpers ────────────────────────────────────────────────────────
function formatDate(iso) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
</script>

<style scoped>
.page { max-width: 1100px; margin: 0 auto; }

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
  flex-wrap: wrap;
}
.page-title { font-size: 20px; font-weight: 700; color: var(--np-text-1); margin-bottom: 4px; }
.page-sub   { font-size: 13px; color: var(--np-text-3); }
.page-actions { display: flex; align-items: center; gap: 12px; }

.saved-hint {
  font-size: 13px;
  color: var(--el-color-success);
  display: flex;
  align-items: center;
  gap: 4px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 0;
  color: var(--np-text-3);
  font-size: 14px;
}

.card { margin-bottom: 20px; background: var(--np-bg-card) !important; border-color: var(--np-border) !important; }

.vc-help { margin-top: 12px; }
.vc-formula {
  font-size: 13px;
  color: var(--np-text-2);
  padding: 8px 0;
}
.vc-formula code { color: var(--np-accent); background: rgba(99,102,241,0.1); padding: 2px 6px; border-radius: 4px; }

.field-hint {
  font-size: 12px;
  color: var(--np-text-3);
  margin-top: 6px;
  line-height: 1.6;
}
.field-hint code { color: var(--np-accent); }
</style>
