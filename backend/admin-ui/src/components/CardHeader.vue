<template>
  <div class="card-header">
    <el-icon class="card-icon"><component :is="icon" /></el-icon>
    <div class="card-header-text">
      <span class="card-title">{{ title }}</span>
      <span v-if="desc" class="card-desc">{{ desc }}</span>
    </div>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  icon:  { type: String, required: true },
  title: { type: String, required: true },
  desc:  { type: String, default: '' },
})
</script>

<style scoped>
.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.card-icon {
  font-size: 18px;
  color: var(--np-accent);
  flex-shrink: 0;
}
.card-header-text { flex: 1; }
.card-title { font-size: 14px; font-weight: 600; color: var(--np-text-1); display: block; }
.card-desc  { font-size: 12px; color: var(--np-text-3); margin-top: 1px; display: block; }
</style>
