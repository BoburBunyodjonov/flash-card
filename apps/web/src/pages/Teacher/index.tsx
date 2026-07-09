import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Send, Plus, Users, BookOpen } from 'lucide-react'
import { teacherApi, type TeacherProfile, type WordPack } from '../../api/teacher.api'

interface Props {
  onBack: () => void
}

export function TeacherPage({ onBack }: Props) {
  const [profiles, setProfiles] = useState<TeacherProfile[]>([])
  const [staffId, setStaffId] = useState<string | null>(null)
  const [packs, setPacks] = useState<WordPack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [groupId, setGroupId] = useState('')
  const [wordLine, setWordLine] = useState('')
  const [transLine, setTransLine] = useState('')
  const [activePackId, setActivePackId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [publishResult, setPublishResult] = useState<string | null>(null)

  const profile = profiles.find((p) => p.staff_id === staffId) ?? profiles[0]

  useEffect(() => {
    teacherApi
      .context()
      .then((data) => {
        setProfiles(data.profiles)
        if (data.profiles[0]) {
          setStaffId(data.profiles[0].staff_id)
          if (data.profiles[0].groups[0]) {
            setGroupId(data.profiles[0].groups[0].external_id)
          }
        }
      })
      .catch(() => setError('O\'qituvchi sifatida ro\'yxatdan o\'tmagansiz'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!staffId) return
    teacherApi.packs(staffId).then(setPacks).catch(console.error)
  }, [staffId])

  const drafts = packs.filter((p) => p.status === 'draft')
  const published = packs.filter((p) => p.status === 'published')

  const handleCreatePack = async () => {
    if (!staffId || !title.trim() || !groupId) return
    setBusy(true)
    try {
      const pack = await teacherApi.createPack({
        staff_id: staffId,
        title: title.trim(),
        group_external_id: groupId,
      })
      setPacks((prev) => [pack, ...prev])
      setActivePackId(pack.id)
      setTitle('')
      setPublishResult(null)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleAddWord = async () => {
    if (!activePackId || !wordLine.trim() || !transLine.trim()) return
    setBusy(true)
    try {
      const pack = await teacherApi.addWords(activePackId, [
        { word: wordLine.trim(), translation: transLine.trim() },
      ])
      setPacks((prev) => prev.map((p) => (p.id === pack.id ? pack : p)))
      setWordLine('')
      setTransLine('')
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handlePublish = async (packId: string) => {
    setBusy(true)
    setPublishResult(null)
    try {
      const res = await teacherApi.publish(packId)
      setPublishResult(
        `${res.students_count} ta o'quvchiga ${res.words_added} ta yangi so'z yuborildi`,
      )
      if (staffId) teacherApi.packs(staffId).then(setPacks)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--ws-bg)' }}>
        <p style={{ color: 'var(--ws-muted)' }}>Yuklanmoqda…</p>
      </div>
    )
  }

  if (error && !profiles.length) {
    return (
      <div className="h-full p-5" style={{ background: 'var(--ws-bg)' }}>
        <button type="button" onClick={onBack} className="flex items-center gap-2 mb-4" style={{ color: 'var(--ws-muted)' }}>
          <ArrowLeft size={20} /> Orqaga
        </button>
        <p style={{ color: 'var(--ws-danger)' }}>{error}</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-24 px-5 pt-6" style={{ background: 'var(--ws-bg)' }}>
      <button type="button" onClick={onBack} className="flex items-center gap-2 mb-4" style={{ color: 'var(--ws-muted)' }}>
        <ArrowLeft size={20} /> Orqaga
      </button>

      <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--ws-text)' }}>O'qituvchi paneli</h1>
      <p className="text-sm mb-5" style={{ color: 'var(--ws-muted)' }}>{profile?.partner_name}</p>

      {profiles.length > 1 && (
        <select
          className="w-full mb-4 p-3 rounded-btn ws-card text-sm"
          value={staffId ?? ''}
          onChange={(e) => setStaffId(e.target.value)}
          style={{ color: 'var(--ws-text)' }}
        >
          {profiles.map((p) => (
            <option key={p.staff_id} value={p.staff_id}>{p.partner_name}</option>
          ))}
        </select>
      )}

      <div className="ws-card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={18} style={{ color: 'var(--ws-primary-light)' }} />
          <span className="font-bold text-sm" style={{ color: 'var(--ws-text)' }}>Guruhlar</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {profile?.groups.map((g) => (
            <button
              key={g.external_id}
              type="button"
              onClick={() => setGroupId(g.external_id)}
              className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{
                background: groupId === g.external_id ? 'var(--ws-gradient)' : 'var(--ws-surface)',
                color: groupId === g.external_id ? '#fff' : 'var(--ws-muted)',
              }}
            >
              {g.name} ({g.students_count})
            </button>
          ))}
        </div>
      </div>

      <div className="ws-card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen size={18} style={{ color: '#10b981' }} />
          <span className="font-bold text-sm" style={{ color: 'var(--ws-text)' }}>Yangi dars to'plami</span>
        </div>
        <input
          className="w-full p-3 rounded-btn mb-2 text-sm ws-card"
          placeholder="Masalan: Hafta 5 — Travel"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ color: 'var(--ws-text)' }}
        />
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={handleCreatePack}
          className="w-full py-3 rounded-btn font-bold text-sm text-white disabled:opacity-50"
          style={{ background: 'var(--ws-gradient)' }}
        >
          <Plus size={16} className="inline mr-1" /> To'plam yaratish
        </button>
      </div>

      {activePackId && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ws-card p-4 mb-4">
          <p className="text-xs mb-2" style={{ color: 'var(--ws-muted)' }}>So'z qo'shish (draft)</p>
          <input
            className="w-full p-3 rounded-btn mb-2 text-sm"
            placeholder="Inglizcha so'z"
            value={wordLine}
            onChange={(e) => setWordLine(e.target.value)}
            style={{ color: 'var(--ws-text)', background: 'var(--ws-surface)' }}
          />
          <input
            className="w-full p-3 rounded-btn mb-3 text-sm"
            placeholder="O'zbekcha tarjima"
            value={transLine}
            onChange={(e) => setTransLine(e.target.value)}
            style={{ color: 'var(--ws-text)', background: 'var(--ws-surface)' }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={handleAddWord}
            className="w-full py-2.5 rounded-btn font-bold text-sm"
            style={{ background: 'var(--ws-surface)', color: 'var(--ws-text)' }}
          >
            Qo'shish
          </button>
        </motion.div>
      )}

      {drafts.length > 0 && (
        <div className="mb-4">
          <p className="font-bold text-sm mb-2" style={{ color: 'var(--ws-text)' }}>Draftlar</p>
          {drafts.map((pack) => (
            <div key={pack.id} className="ws-card p-4 mb-2">
              <p className="font-bold" style={{ color: 'var(--ws-text)' }}>{pack.title}</p>
              <p className="text-xs mb-3" style={{ color: 'var(--ws-muted)' }}>
                {pack._count?.items ?? pack.items.length} ta so'z
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActivePackId(pack.id)}
                  className="flex-1 py-2 rounded-btn text-xs font-bold"
                  style={{ background: 'var(--ws-surface)', color: 'var(--ws-text)' }}
                >
                  Tahrirlash
                </button>
                <button
                  type="button"
                  disabled={busy || !(pack._count?.items ?? pack.items.length)}
                  onClick={() => handlePublish(pack.id)}
                  className="flex-1 py-2 rounded-btn text-xs font-bold text-white flex items-center justify-center gap-1 disabled:opacity-50"
                  style={{ background: 'var(--ws-gradient)' }}
                >
                  <Send size={14} /> Guruhga yuborish
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {publishResult && (
        <p className="text-sm font-semibold mb-4 p-3 rounded-btn" style={{ color: 'var(--ws-success)', background: 'rgba(16,185,129,0.12)' }}>
          {publishResult}
        </p>
      )}

      {published.length > 0 && (
        <div>
          <p className="font-bold text-sm mb-2" style={{ color: 'var(--ws-muted)' }}>Yuborilgan</p>
          {published.slice(0, 5).map((pack) => (
            <div key={pack.id} className="ws-card-2 p-3 mb-2 text-sm" style={{ color: 'var(--ws-faint)' }}>
              {pack.title} · {pack.items.length} so'z
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
