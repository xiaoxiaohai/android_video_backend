<!-- Mock dialog preview showing how the update prompt looks on device -->
<template>
  <div class="preview-wrap">
    <div class="phone-shell">
      <div class="phone-screen">
        <!-- Dimmed background -->
        <div class="screen-bg" />
        <!-- Dialog -->
        <div class="dialog">
          <div class="dialog-title">
            {{ isForce ? '需要更新' : '发现新版本' }}
          </div>
          <div class="dialog-body">{{ message }}</div>

          <template v-if="notes.length">
            <div class="dialog-notes-title">更新内容：</div>
            <div v-for="(n, i) in notes.slice(0, 3)" :key="i" class="dialog-note">
              · {{ n }}
            </div>
            <div v-if="notes.length > 3" class="dialog-note muted">
              还有 {{ notes.length - 3 }} 条…
            </div>
          </template>

          <div class="dialog-actions">
            <button v-if="!isForce" class="btn-later">稍后</button>
            <button class="btn-update">立即更新</button>
          </div>
        </div>
      </div>
    </div>

    <div class="preview-label">
      <el-tag :type="isForce ? 'danger' : 'success'" size="small">
        {{ isForce ? '强制更新' : '可选更新' }}
      </el-tag>
      <span class="preview-ver" v-if="form.latestVersionName">
        v{{ form.latestVersionName }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  form: { type: Object, required: true },
})

const isForce = computed(() => props.form.minRequiredVersionCode > 0)

const message = computed(() => {
  if (isForce.value) {
    return props.form.forceUpdateMessage ||
      '当前版本已停止支持，请更新后继续使用。'
  }
  return props.form.optionalUpdateMessage ||
    '发现新版本，建议更新以获得更好体验。'
})

const notes = computed(() =>
  props.form.releaseNotes
    .split('\n').map(s => s.trim()).filter(Boolean)
)
</script>

<style scoped>
.preview-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; }

.phone-shell {
  width: 200px;
  height: 360px;
  background: #0a0b12;
  border: 2px solid #2d3154;
  border-radius: 24px;
  padding: 12px 8px;
  position: relative;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.phone-screen {
  width: 100%;
  height: 100%;
  background: #1a1d2e;
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.screen-bg {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.6);
}
.dialog {
  position: relative;
  background: #252840;
  border-radius: 12px;
  padding: 14px 14px 12px;
  margin: 12px;
  z-index: 1;
}
.dialog-title {
  font-size: 11px;
  font-weight: 700;
  color: #e2e8f0;
  margin-bottom: 7px;
}
.dialog-body {
  font-size: 9.5px;
  color: #8892aa;
  line-height: 1.5;
  margin-bottom: 7px;
}
.dialog-notes-title {
  font-size: 9px;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 3px;
}
.dialog-note {
  font-size: 9px;
  color: #8892aa;
  line-height: 1.6;
}
.dialog-note.muted { color: #4e5a7a; }

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}
.btn-later {
  background: transparent;
  border: none;
  color: #8892aa;
  font-size: 9px;
  cursor: default;
  padding: 3px 6px;
}
.btn-update {
  background: #6366f1;
  border: none;
  border-radius: 5px;
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  cursor: default;
  padding: 4px 8px;
}

.preview-label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview-ver { font-size: 12px; color: var(--np-text-3); }
</style>
