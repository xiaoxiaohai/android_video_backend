import { defineStore } from 'pinia'
import { ref } from 'vue'
import { TOKEN_KEY, api } from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY))

  async function login(password) {
    const data = await api.login(password)
    token.value = data.token
    localStorage.setItem(TOKEN_KEY, data.token)
  }

  function logout() {
    token.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  const isLoggedIn = () => !!localStorage.getItem(TOKEN_KEY)

  return { token, login, logout, isLoggedIn }
})
