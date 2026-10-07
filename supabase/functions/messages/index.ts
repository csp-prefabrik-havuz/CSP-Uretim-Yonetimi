import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json; charset=utf-8',
}

type Profile = {
  id: string
  username: string
  display_name: string | null
  department: string | null
  role: string
  allowed_pages: string[] | null
  is_active: boolean
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const text = (value: unknown, limit = 2000) => String(value ?? '').trim().slice(0, limit)
const canUseMessages = (profile: Profile) => profile.role === 'admin' || (profile.allowed_pages ?? []).includes('messages')
const labelFor = (profile: Profile | undefined) => profile?.display_name?.trim() || profile?.username || 'Bilinmeyen kullanıcı'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Yalnızca POST isteği kabul edilir.' }, 405)

  const projectUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization') ?? ''
  if (!projectUrl || !anonKey || !serviceKey || !authorization.startsWith('Bearer ')) return json({ error: 'Oturum doğrulanamadı.' }, 401)

  const sessionClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sessionData, error: sessionError } = await sessionClient.auth.getUser()
  if (sessionError || !sessionData.user) return json({ error: 'Oturum doğrulanamadı.' }, 401)

  const admin = createClient(projectUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: profileData, error: profileError } = await admin
    .from('profiles').select('id, username, display_name, department, role, allowed_pages, is_active')
    .eq('id', sessionData.user.id).maybeSingle()
  const profile = profileData as Profile | null
  if (profileError || !profile?.is_active || !canUseMessages(profile)) return json({ error: 'Mesajlar için erişiminiz yok.' }, 403)

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return json({ error: 'Geçersiz istek içeriği.' }, 400) }
  const action = text(body.action, 30)

  const { data: profilesData, error: profilesError } = await admin
    .from('profiles').select('id, username, display_name, department, role, allowed_pages, is_active')
    .eq('is_active', true)
  if (profilesError) return json({ error: 'Kullanıcılar alınamadı.' }, 500)
  const profiles = (profilesData ?? []) as Profile[]
  const visibleProfiles = profiles.filter((item) => canUseMessages(item))
  const profileMap = new Map(visibleProfiles.map((item) => [item.id, item]))

  if (action === 'recipients') {
    return json({ recipients: visibleProfiles.filter((item) => item.id !== profile.id).map((item) => ({ id: item.id, name: labelFor(item), department: item.department || '' })) })
  }

  if (action === 'list') {
    let query = admin.from('direct_messages').select('*').order('created_at', { ascending: false }).limit(200)
    if (profile.role !== 'admin') query = query.or(`sender_id.eq.${profile.id},recipient_id.eq.${profile.id}`)
    const { data, error } = await query
    if (error) return json({ error: 'Mesajlar alınamadı.' }, 500)
    const messages = (data ?? []).map((message) => ({
      ...message,
      sender_name: labelFor(profileMap.get(message.sender_id)),
      recipient_name: labelFor(profileMap.get(message.recipient_id)),
      can_delete: profile.role === 'admin' || message.sender_id === profile.id,
    }))
    return json({ messages, current_user_id: profile.id, unread_count: messages.filter((message) => message.recipient_id === profile.id && !message.read_at).length })
  }

  if (action === 'send') {
    const recipientId = text(body.recipientId, 80)
    const subject = text(body.subject, 120)
    const messageBody = text(body.body, 2000)
    if (!recipientId || !messageBody) return json({ error: 'Alıcı ve mesaj metni zorunludur.' }, 400)
    if (recipientId === profile.id) return json({ error: 'Kendinize mesaj gönderemezsiniz.' }, 400)
    const recipient = profileMap.get(recipientId)
    if (!recipient) return json({ error: 'Alıcı aktif değil veya mesaj erişimi bulunmuyor.' }, 400)
    const { error } = await admin.from('direct_messages').insert({ sender_id: profile.id, recipient_id: recipientId, subject, body: messageBody })
    if (error) return json({ error: 'Mesaj gönderilemedi.' }, 500)
    return json({ ok: true })
  }

  const messageId = text(body.messageId, 80)
  if (!messageId) return json({ error: 'Mesaj kimliği gerekli.' }, 400)
  const { data: message, error: messageError } = await admin.from('direct_messages').select('*').eq('id', messageId).maybeSingle()
  if (messageError || !message) return json({ error: 'Mesaj bulunamadı.' }, 404)

  if (action === 'read') {
    if (message.recipient_id !== profile.id && profile.role !== 'admin') return json({ error: 'Bu mesajı güncelleme yetkiniz yok.' }, 403)
    const { error } = await admin.from('direct_messages').update({ read_at: message.read_at || new Date().toISOString() }).eq('id', messageId)
    if (error) return json({ error: 'Mesaj okunmuş olarak işaretlenemedi.' }, 500)
    return json({ ok: true })
  }

  if (action === 'delete') {
    if (profile.role !== 'admin' && message.sender_id !== profile.id) return json({ error: 'Bu mesajı silme yetkiniz yok.' }, 403)
    const { error } = await admin.from('direct_messages').delete().eq('id', messageId)
    if (error) return json({ error: 'Mesaj silinemedi.' }, 500)
    return json({ ok: true })
  }

  return json({ error: 'Bilinmeyen işlem.' }, 400)
})
