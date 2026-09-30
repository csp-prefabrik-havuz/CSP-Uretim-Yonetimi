const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Sunucu yalnızca rapora sığacak ürün görsellerini geçirir. Büyük kaynak
// dosyaları engellemek, her paylaşımda oluşabilecek egress'i sınırlar.
const maxImageBytes = 5 * 1024 * 1024
const safeImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

const isPublicHttpsUrl = (value: string) => {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.username || url.password) return false
    if (host === 'localhost' || host.endsWith('.local') || host === '::1') return false
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return false
    if (/^\[?[0-9a-f:]+\]?$/i.test(host)) return false
    return true
  } catch {
    return false
  }
}

const fetchImage = async (source: string) => {
  let target = source
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    if (!isPublicHttpsUrl(target)) throw new Error('Görsel bağlantısı güvenli değil.')
    const response = await fetch(target, {
      redirect: 'manual',
      headers: { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Görsel yönlendirmesi tamamlanamadı.')
      target = new URL(location, target).toString()
      continue
    }
    if (!response.ok || !response.body) throw new Error('Görsel sunucudan alınamadı.')
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!safeImageTypes.has(contentType)) throw new Error('Yalnızca JPG, PNG, WEBP ve GIF görselleri kullanılabilir.')
    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength > maxImageBytes) throw new Error('Görsel dosyası çok büyük.')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxImageBytes) {
        await reader.cancel()
        throw new Error('Görsel dosyası çok büyük.')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { bytes, contentType }
  }
  throw new Error('Görsel yönlendirmesi sınırı aşıldı.')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Yalnızca POST isteği kabul edilir.' }, 405)
  try {
    const body = await request.json()
    const source = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!source) return json({ error: 'Görsel bağlantısı girilmelidir.' }, 400)
    const { bytes, contentType } = await fetchImage(source)
    return new Response(bytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Görsel okunamadı.' }, 400)
  }
})
