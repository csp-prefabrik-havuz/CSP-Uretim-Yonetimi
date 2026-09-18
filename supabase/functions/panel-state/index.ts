import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json; charset=utf-8',
}

type JsonRecord = Record<string, unknown>
type Profile = {
  role: string
  is_active: boolean
  allowed_pages: string[] | null
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const pageSet = (profile: Profile) => new Set(
  profile.role === 'admin' ? ['*'] : (profile.allowed_pages ?? []).map(String),
)

const canUse = (pages: Set<string>, required: readonly string[]) =>
  pages.has('*') || required.some((page) => pages.has(page))

const stateAreas = [
  {
    keys: ['orders', 'nextOrderId'],
    read: ['orders', 'workorders', 'planning', 'shipping'],
    write: ['orders', 'workorders', 'planning', 'shipping'],
  },
  {
    keys: ['workorderRecords', 'savedWorkorderId'],
    read: ['workorders', 'planning', 'shipping'],
    write: ['workorders', 'planning', 'shipping'],
  },
  {
    keys: ['stockCards', 'nextStockCardId', 'linerStarterCardsImported'],
    read: ['stock', 'stock-summary', 'stock-report', 'liner-widths', 'orders', 'workorders', 'planning', 'shipping'],
    write: ['stock', 'workorders', 'planning', 'shipping'],
  },
  {
    keys: ['importedStockCards', 'importedStockMovements', 'importedSalesOrders', 'nextImportedStockCardId', 'nextImportedStockMovementId', 'nextImportedSalesOrderId'],
    read: ['imported-stock', 'imported-stock-entry', 'imported-stock-exit', 'imported-sales'],
    write: ['imported-stock', 'imported-stock-entry', 'imported-stock-exit', 'imported-sales'],
  },
  {
    keys: ['series', 'releasedCodes'],
    read: ['series', 'orders', 'workorders'],
    write: ['series', 'orders', 'workorders'],
  },
] as const

const defaults: JsonRecord = {
  orders: [],
  stockCards: [],
  importedStockCards: [],
  importedStockMovements: [],
  importedSalesOrders: [],
  workorderRecords: [],
  series: {},
  releasedCodes: {},
  nextOrderId: 1,
  nextStockCardId: 1,
  nextImportedStockCardId: 1,
  nextImportedStockMovementId: 1,
  nextImportedSalesOrderId: 1,
  linerStarterCardsImported: 0,
  savedWorkorderId: 1,
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const keysFor = (pages: Set<string>, mode: 'read' | 'write') => {
  const keys = new Set<string>()
  for (const area of stateAreas) {
    const requiredPages = mode === 'read' ? area.read : area.write
    if (canUse(pages, requiredPages)) area.keys.forEach((key) => keys.add(key))
  }
  return keys
}

const filteredState = (state: JsonRecord, readableKeys: Set<string>) => {
  const result = copy(defaults)
  for (const key of readableKeys) {
    if (key in state) result[key] = copy(state[key])
  }
  return result
}

const mergeWritableState = (current: JsonRecord, incoming: JsonRecord, writableKeys: Set<string>) => {
  const result = { ...copy(defaults), ...copy(current) }
  for (const key of writableKeys) {
    if (key in incoming) result[key] = copy(incoming[key])
  }
  return result
}

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
  const { data: profileData, error: profileError } = await admin
    .from('profiles')
    .select('role, is_active, allowed_pages')
    .eq('id', sessionData.user.id)
    .maybeSingle()
  const profile = profileData as Profile | null
  if (profileError || !profile?.is_active) return json({ error: 'Bu kullanıcı için aktif panel erişimi tanımlı değil.' }, 403)

  let body: JsonRecord
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Geçersiz istek içeriği.' }, 400)
  }

  const pages = pageSet(profile)
  const readableKeys = keysFor(pages, 'read')
  const writableKeys = keysFor(pages, 'write')
  const action = String(body.action ?? '')
  const { data: stored, error: stateError } = await admin
    .from('app_state')
    .select('data')
    .eq('id', 'main')
    .maybeSingle()
  if (stateError) return json({ error: 'Panel verileri okunamadı.' }, 500)

  const currentState = stored?.data && typeof stored.data === 'object'
    ? stored.data as JsonRecord
    : copy(defaults)

  if (action === 'pull') {
    return json({ state: filteredState(currentState, readableKeys) })
  }

  if (action === 'push') {
    const incoming = body.state
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return json({ error: 'Panel verisi geçersiz.' }, 400)
    }
    if (!writableKeys.size) return json({ error: 'Bu kullanıcı için kayıt yetkisi tanımlı değil.' }, 403)
    const nextState = mergeWritableState(currentState, incoming as JsonRecord, writableKeys)
    const { error: writeError } = await admin
      .from('app_state')
      .upsert({ id: 'main', data: nextState, updated_by: sessionData.user.id })
    if (writeError) return json({ error: 'Panel verileri kaydedilemedi.' }, 500)
    return json({ ok: true })
  }

  return json({ error: 'Bilinmeyen işlem.' }, 400)
})
