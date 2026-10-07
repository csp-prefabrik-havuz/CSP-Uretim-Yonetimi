import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json; charset=utf-8',
}

const pageIds = new Set([
  'dashboard', 'orders', 'workorders', 'planning', 'stock', 'stock-summary',
  'stock-report', 'liner-widths', 'shipping', 'series', 'settings',
  'imported-stock', 'imported-stock-entry', 'imported-stock-exit', 'imported-sales',
  'imported-customers', 'warehouse-shipping', 'manual-cargo-label',
  'service-history-search', 'messages',
])

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const normalizeUsername = (value: unknown) => String(value ?? '')
  .trim()
  .toLocaleLowerCase('tr-TR')
  .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
  .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
  .replace(/[^a-z0-9._-]/g, '')

const allowedPages = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.map((item) => String(item)).filter((item) => pageIds.has(item)))]
  : []

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Yalnızca POST isteği kabul edilir.' }, 405)

  const projectUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!projectUrl || !anonKey || !serviceKey) return json({ error: 'Sunucu yapılandırması eksik.' }, 500)

  const authorization = request.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Oturum doğrulanamadı.' }, 401)

  const sessionClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sessionData, error: sessionError } = await sessionClient.auth.getUser()
  if (sessionError || !sessionData.user) return json({ error: 'Oturum doğrulanamadı.' }, 401)

  const admin = createClient(projectUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: requester, error: requesterError } = await sessionClient
    .from('profiles')
    .select('role, is_active')
    .eq('id', sessionData.user.id)
    .maybeSingle()
  console.log(JSON.stringify({
    event: 'admin_access_check',
    userId: sessionData.user.id,
    hasProfile: Boolean(requester),
    role: requester?.role ?? null,
    isActive: requester?.is_active ?? null,
    profileError: requesterError?.message ?? null,
  }))
  if (requesterError || !requester?.is_active || requester.role !== 'admin') {
    return json({ error: 'Bu işlem yalnızca aktif yöneticiler tarafından yapılabilir.' }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Geçersiz istek içeriği.' }, 400)
  }

  const action = String(body.action ?? '')
  const profileValues = {
    display_name: String(body.displayName ?? '').trim().slice(0, 80),
    department: String(body.department ?? '').trim().slice(0, 80),
    role: body.role === 'admin' ? 'admin' : 'user',
    allowed_pages: allowedPages(body.allowedPages),
    is_active: body.isActive !== false,
  }

  if (action === 'list') {
    const { data, error } = await sessionClient
      .from('profiles')
      .select('id, username, display_name, department, role, allowed_pages, is_active, created_at')
      .order('username')
    if (error) return json({ error: 'Kullanıcı listesi alınamadı.' }, 400)
    return json({ users: data ?? [] })
  }

  if (action === 'create') {
    const username = normalizeUsername(body.username)
    const password = String(body.password ?? '')
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
      return json({ error: 'Kullanıcı adı 3–32 karakter olmalı; harf, rakam, nokta, alt çizgi veya tire kullanılabilir.' }, 400)
    }
    if (password.length < 8) return json({ error: 'Şifre en az 8 karakter olmalıdır.' }, 400)
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: `${username}@csp.local`,
      password,
      email_confirm: true,
      user_metadata: { display_name: profileValues.display_name },
    })
    if (createError || !created.user) return json({ error: createError?.message || 'Kullanıcı oluşturulamadı.' }, 400)
    const { error: profileError } = await sessionClient.from('profiles').upsert({
      id: created.user.id,
      ...profileValues,
      username,
    }, { onConflict: 'id' })
    if (profileError) return json({ error: 'Kullanıcı oluşturuldu; profil yetkileri kaydedilemedi.' }, 400)
    return json({ ok: true, userId: created.user.id })
  }

  if (action === 'update') {
    const userId = String(body.userId ?? '')
    if (!userId) return json({ error: 'Güncellenecek kullanıcı bulunamadı.' }, 400)
    if (userId === sessionData.user.id && (profileValues.role !== 'admin' || !profileValues.is_active)) {
      return json({ error: 'Kendi yönetici hesabınızı pasifleştiremez veya yönetici rolünü kaldıramazsınız.' }, 400)
    }
    const password = String(body.password ?? '')
    if (password && password.length < 8) return json({ error: 'Yeni şifre en az 8 karakter olmalıdır.' }, 400)
    if (password) {
      const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password })
      if (passwordError) return json({ error: passwordError.message || 'Şifre güncellenemedi.' }, 400)
    }
    const { error: updateError } = await sessionClient.from('profiles').update(profileValues).eq('id', userId)
    if (updateError) return json({ error: 'Kullanıcı yetkileri güncellenemedi.' }, 400)
    return json({ ok: true })
  }

  return json({ error: 'Bilinmeyen işlem.' }, 400)
})
