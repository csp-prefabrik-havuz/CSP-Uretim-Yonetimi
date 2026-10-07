import { withSupabase } from 'npm:@supabase/server@^1'

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
    // Genel stok özeti üretim ve hazır ürün stok miktarlarını birlikte gösterir.
    // Bu sayfaya erişimi olan kullanıcı yalnızca stok kartlarını okur; giriş,
    // çıkış ve satış hareketleri hazır ürün sayfalarına özel kalır.
    keys: ['importedStockCards', 'nextImportedStockCardId'],
    read: ['stock-summary', 'imported-stock', 'imported-stock-entry', 'imported-stock-exit', 'imported-sales', 'warehouse-shipping'],
    write: ['imported-stock', 'imported-stock-entry', 'imported-stock-exit', 'imported-sales'],
  },
  {
    keys: ['importedStockMovements', 'importedSalesOrders', 'nextImportedStockMovementId', 'nextImportedSalesOrderId'],
    read: ['imported-stock', 'imported-stock-entry', 'imported-stock-exit', 'imported-sales'],
    write: ['imported-stock', 'imported-stock-entry', 'imported-stock-exit', 'imported-sales'],
  },
  {
    // Cariler satış ekranındaki seçim listesinde de kullanılır. Bu nedenle
    // cari yönetimi yetkisi olan kullanıcıların eklediği kayıtlar, satış
    // yetkisi olan tüm kullanıcılar tarafından okunabilmelidir.
    keys: ['importedCustomers', 'nextImportedCustomerId'],
    read: ['imported-customers', 'imported-sales'],
    write: ['imported-customers'],
  },
  {
    keys: ['warehouseShipments', 'nextWarehouseShipmentId'],
    read: ['warehouse-shipping'],
    write: ['warehouse-shipping'],
  },
  {
    keys: ['manualDocuments', 'nextManualDocumentId'],
    read: ['manual-cargo-label'],
    write: ['manual-cargo-label'],
  },
  {
    keys: ['serviceHistoryRecords'],
    read: ['service-history-search'],
    write: ['service-history-search'],
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
  importedCustomers: [],
  warehouseShipments: [],
  manualDocuments: [],
  serviceHistoryRecords: [],
  nextManualDocumentId: 1,
  workorderRecords: [],
  series: {},
  releasedCodes: {},
  nextOrderId: 1,
  nextStockCardId: 1,
  nextImportedStockCardId: 1,
  nextImportedStockMovementId: 1,
  nextImportedSalesOrderId: 1,
  nextImportedCustomerId: 1,
  nextWarehouseShipmentId: 1,
  linerStarterCardsImported: 0,
  savedWorkorderId: 1,
  // Silinen kayıtların kimlikleri burada tutulur. Bu sayede eski bir
  // bilgisayardaki kayıt, sonraki eşitlemede yanlışlıkla tekrar gelmez.
  deletedRecords: {},
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

const collectionKeys = new Set([
  'orders', 'stockCards', 'importedStockCards', 'importedStockMovements', 'importedCustomers',
  'importedSalesOrders', 'warehouseShipments', 'manualDocuments', 'serviceHistoryRecords', 'workorderRecords',
])

const deletedRecordsFor = (value: unknown, allowedKeys: Set<string>) => {
  if (!isRecord(value)) return {}
  const result: JsonRecord = {}
  for (const key of allowedKeys) {
    if (!collectionKeys.has(key) || !Array.isArray(value[key])) continue
    result[key] = [...new Set(value[key].map((identity) => text(identity)).filter(Boolean))]
  }
  return result
}

const filteredState = (state: JsonRecord, readableKeys: Set<string>) => {
  const result = copy(defaults)
  const deletedRecords = deletedRecordsFor(state.deletedRecords, readableKeys)
  for (const key of readableKeys) {
    if (!(key in state)) continue
    const value = state[key]
    // Daha önce hatalı olarak buluta geri gelmiş bir kayıt, silme kimliği
    // durduğu sürece hiçbir kullanıcıya yeniden gösterilmemelidir.
    if (collectionKeys.has(key) && Array.isArray(value)) {
      const deleted = new Set(
        Array.isArray(deletedRecords[key])
          ? deletedRecords[key].map((identity) => text(identity))
          : [],
      )
      result[key] = value
        .filter((item, index) => !deleted.has(itemIdentity(key, item, index)))
        .map((item) => copy(item))
    } else {
      result[key] = copy(value)
    }
  }
  // Silme kayıtları yalnızca kullanıcının okuyabildiği veri alanları için verilir.
  result.deletedRecords = deletedRecordsFor(state.deletedRecords, readableKeys)
  return result
}

const text = (value: unknown) => String(value ?? '').trim()
const quantity = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const isRecord = (value: unknown): value is JsonRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const itemIdentity = (area: string, value: unknown, index: number) => {
  if (!isRecord(value)) return area + ':value:' + index + ':' + text(value)
  // Stok kodu farklı bilgisayarlarda da aynı ürünün güvenilir ortak anahtarıdır.
  if (area === 'stockCards' || area === 'importedStockCards') {
    const code = text(value.code).toLocaleUpperCase('tr-TR')
    if (code) return area + ':code:' + code
  }
  const id = text(value.id ?? value.orderId ?? value.code ?? value.number)
  return id ? area + ':id:' + id : area + ':row:' + index
}
const mergeArray = (area: string, current: unknown[], incoming: unknown[]) => {
  const merged = new Map<string, unknown>()
  current.forEach((item, index) => merged.set(itemIdentity(area, item, index), copy(item)))
  // Aynı stok kodu güncellenmişse son kayıt kullanılır; farklı kartlar korunur.
  incoming.forEach((item, index) => merged.set(itemIdentity(area, item, index), copy(item)))
  return [...merged.values()]
}
const counterKeys = new Set([
  'nextOrderId', 'nextStockCardId', 'nextImportedStockCardId',
  'nextImportedStockMovementId', 'nextImportedSalesOrderId', 'nextImportedCustomerId', 'nextWarehouseShipmentId',
  'linerStarterCardsImported', 'savedWorkorderId',
])
const mergeWritableState = (current: JsonRecord, incoming: JsonRecord, writableKeys: Set<string>) => {
  const result = { ...copy(defaults), ...copy(current) }
  const currentDeletedRecords = deletedRecordsFor(current.deletedRecords, collectionKeys)
  const receivedDeletedRecords = deletedRecordsFor(incoming.deletedRecords, writableKeys)
  const nextDeletedRecords = copy(currentDeletedRecords) as JsonRecord
  for (const key of writableKeys) {
    if (!(key in incoming)) continue
    const existing = current[key]
    const received = incoming[key]
    if (Array.isArray(existing) && Array.isArray(received)) {
      // Eksik kayıt normalde başka bilgisayarda henüz görünmemiş olabilir.
      // Bu nedenle yalnızca istemcinin açıkça bildirdiği silinen kimlikler
      // kaldırılır; diğer bilgisayardaki eklemeler korunur.
      const deleted = new Set<string>([
        ...(Array.isArray(currentDeletedRecords[key]) ? currentDeletedRecords[key] as string[] : []),
        ...(Array.isArray(receivedDeletedRecords[key]) ? receivedDeletedRecords[key] as string[] : []),
      ])
      const remaining = existing.filter((item, index) => !deleted.has(itemIdentity(key, item, index)))
      // Başka bilgisayarda sayfa açık kaldıysa o bilgisayar eski bir listeyi
      // gönderebilir. Silme kaydı bulunan bir ürün bu eski listeyle yeniden
      // eklenmemelidir; silme her zaman önceliklidir.
      const receivedWithoutDeleted = received.filter((item, index) => !deleted.has(itemIdentity(key, item, index)))
      result[key] = mergeArray(key, remaining, receivedWithoutDeleted)
      if (collectionKeys.has(key)) {
        if (deleted.size) nextDeletedRecords[key] = [...deleted]
        else delete nextDeletedRecords[key]
      }
    } else if (counterKeys.has(key)) {
      result[key] = Math.max(quantity(existing), quantity(received))
    } else if (isRecord(existing) && isRecord(received) && (key === 'series' || key === 'releasedCodes')) {
      result[key] = { ...copy(existing), ...copy(received) }
    } else {
      result[key] = copy(received)
    }
  }
  result.deletedRecords = nextDeletedRecords
  return result
}
export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
  if (request.method !== 'POST') return json({ error: 'Yalnızca POST isteği kabul edilir.' }, 405)

    const userId = String(ctx.userClaims?.id ?? '')
    if (!userId) return json({ error: 'Oturum doğrulanamadı.' }, 401)
    // Kullanıcı bilgisi, yöneticilik anahtarı yerine çağrıyı yapan kullanıcının
    // doğrulanmış oturum istemcisiyle okunur. Tarayıcıdaki girişle aynı RLS kuralı uygulanır.
    const { data: profileData, error: profileError } = await ctx.supabase
      .from('profiles')
      .select('role, is_active, allowed_pages')
      .eq('id', userId)
      .maybeSingle()
    const profile = profileData as Profile | null
    if (profileError || !profile?.is_active) return json({ error: 'Bu kullanıcı için aktif panel erişimi tanımlı değil.' }, 403)
    // app_state tablosundaki RLS kuralları aktif kullanıcılar için okuma,
    // yetkili sayfalar için de yazma izni veriyor. Bu istemciyle çalışmak,
    // sunucuda yönetici anahtarının kullanılabilir olmadığı durumlarda dahi
    // aynı yetki kurallarının güvenilir biçimde uygulanmasını sağlar.
    const admin = ctx.supabase

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
    return json({
      state: filteredState(currentState, readableKeys),
      // Boş bir stok listesi de geçerli bir bulut durumudur. Aksi hâlde
      // tarayıcı, silme sonrası boşalan bulutu yok sayıp eski yerel listeyi
      // yeniden yükleyebilir. Yalnızca henüz hiç app_state kaydı yoksa false.
      has_state: Boolean(stored),
    })
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
      .upsert({ id: 'main', data: nextState, updated_by: userId })
    if (writeError) return json({ error: 'Panel verileri kaydedilemedi.' }, 500)
    return json({ ok: true })
  }

  return json({ error: 'Bilinmeyen işlem.' }, 400)
  }),
}
