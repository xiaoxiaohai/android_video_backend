export const TOKEN_KEY = 'np_admin_token'

function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

async function request(method, url, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    window.location.hash = '/login'
    throw new Error('登录状态已过期，请重新登录')
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

export const api = {
  login:     (password)  => request('POST', '/api/admin/login', { password }),
  getConfig: ()          => request('GET',  '/api/admin/app-config'),
  saveConfig: (config)   => request('PUT',  '/api/admin/app-config', config),
}
