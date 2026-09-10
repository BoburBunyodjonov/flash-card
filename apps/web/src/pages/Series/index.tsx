import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  ListVideo, ArrowLeft, Film, Clapperboard, CheckCircle2, Frown, Inbox, RotateCcw, Play,
} from 'lucide-react'
import { playlistApi, type PlaylistDTO, type PlaylistItem } from '../../api/playlist.api'
import { CinemaPlayerView } from '../Cinema'
import { ShadowingPlayerView } from '../Shadowing'

const ACCENT = '#8b5cf6'

function fmtTime(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Playing a playlist, item by item, with auto-advance ─────────────────────────
function PlaylistPlayer({
  playlist,
  startIndex,
  onExit,
}: {
  playlist: PlaylistDTO
  startIndex: number
  onExit: () => void
}) {
  const items = useMemo(() => (playlist.items ?? []).filter((i) => i.available), [playlist])
  const [index, setIndex] = useState(startIndex)

  const current = items[index]
  const hasNext = index < items.length - 1

  const goNext = useCallback(() => {
    if (hasNext) setIndex((i) => i + 1)
    else onExit()
  }, [hasNext, onExit])

  if (!current) {
    onExit()
    return null
  }

  const key = `${current.kind}:${current.clipId}`
  if (current.kind === 'cinema') {
    return (
      <CinemaPlayerView
        key={key}
        id={current.clipId}
        onBack={onExit}
        onCompleted={() => {}}
        onNext={hasNext ? goNext : undefined}
      />
    )
  }
  return (
    <ShadowingPlayerView
      key={key}
      id={current.clipId}
      onBack={onExit}
      onCompleted={() => {}}
      onNext={hasNext ? goNext : undefined}
    />
  )
}

// ── Playlist detail (ordered clips) ─────────────────────────────────────────────
function DetailView({
  id,
  onBack,
}: {
  id: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [playlist, setPlaylist] = useState<PlaylistDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [playFrom, setPlayFrom] = useState<number | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    playlistApi.get(id).then(setPlaylist).catch(() => setError(true)).finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  if (playFrom !== null && playlist) {
    return (
      <PlaylistPlayer
        playlist={playlist}
        startIndex={playFrom}
        onExit={() => { setPlayFrom(null); load() }}
      />
    )
  }

  const items = playlist?.items ?? []
  const firstPlayable = items.findIndex((i) => i.available)

  return (
    <div className="h-full overflow-y-auto no-scrollbar" style={{ background: 'var(--ws-bg)' }}>
      <div className="px-5 pt-4 pb-28 max-w-lg mx-auto">
        <motion.button whileTap={{ scale: 0.95 }} onClick={onBack}
          className="font-semibold text-sm flex items-center gap-1 mb-3" style={{ color: ACCENT }}>
          <ArrowLeft size={16} /> {t('series.back')}
        </motion.button>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-9 h-9 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: ACCENT, borderTopColor: 'transparent' }} />
          </div>
        )}

        {!loading && (error || !playlist) && (
          <div className="flex flex-col items-center gap-4 py-16">
            <Frown size={36} style={{ color: 'var(--ws-muted)' }} />
            <p className="font-bold" style={{ color: 'var(--ws-text)' }}>{t('series.loadError')}</p>
            <button onClick={load} className="px-5 py-2.5 rounded-btn text-sm font-bold flex items-center gap-2"
              style={{ background: 'var(--ws-card-2)', color: 'var(--ws-text)' }}>
              <RotateCcw size={14} /> {t('cinema.retry')}
            </button>
          </div>
        )}

        {!loading && playlist && (
          <>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--ws-text)' }}>
              {playlist.title}
            </h1>
            {playlist.description && (
              <p className="text-sm mt-1.5" style={{ color: 'var(--ws-muted)' }}>{playlist.description}</p>
            )}
            <p className="text-xs mt-1" style={{ color: 'var(--ws-faint)' }}>
              {t('series.videoCount', { count: playlist.itemCount })}
            </p>

            {firstPlayable >= 0 && (
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => setPlayFrom(firstPlayable)}
                className="w-full mt-4 py-3.5 rounded-btn font-black text-sm text-white flex items-center justify-center gap-2"
                style={{ background: ACCENT, boxShadow: '0 8px 24px rgba(139,92,246,0.3)' }}>
                <Play size={18} fill="#fff" /> {t('series.title')}
              </motion.button>
            )}

            <div className="flex flex-col gap-2.5 mt-5">
              {items.map((it, i) => (
                <ItemRow key={it.id} item={it} index={i} onPlay={() => setPlayFrom(i)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ItemRow({ item, index, onPlay }: { item: PlaylistItem; index: number; onPlay: () => void }) {
  const disabled = !item.available
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPlay}
      className="w-full flex items-center gap-3 p-3.5 ws-card text-left disabled:opacity-45"
    >
      <div className="shrink-0 w-6 text-center text-sm font-black" style={{ color: 'var(--ws-faint)' }}>
        {index + 1}
      </div>
      <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
        style={{
          background: item.completed ? 'rgba(16,185,129,0.15)' : `${ACCENT}1f`,
          border: `1px solid ${item.completed ? 'rgba(16,185,129,0.3)' : `${ACCENT}44`}`,
        }}>
        {item.completed
          ? <CheckCircle2 size={18} style={{ color: 'var(--ws-success)' }} />
          : item.kind === 'cinema'
            ? <Film size={18} style={{ color: ACCENT }} />
            : <Clapperboard size={18} style={{ color: ACCENT }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[15px] truncate" style={{ color: 'var(--ws-text)' }}>
          {item.title ?? '—'}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-black uppercase" style={{ color: 'var(--ws-faint)' }}>
            {item.kind}
          </span>
          {item.level && <span className="text-[10px] font-bold" style={{ color: ACCENT }}>{item.level}</span>}
          <span className="text-xs" style={{ color: 'var(--ws-muted)' }}>{fmtTime(item.durationSec)}</span>
        </div>
      </div>
    </button>
  )
}

// ── List of playlists ───────────────────────────────────────────────────────────
export function SeriesPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [playlists, setPlaylists] = useState<PlaylistDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    playlistApi.list().then((d) => setPlaylists(Array.isArray(d) ? d : [])).catch(() => setError(true)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (openId) {
    return <DetailView id={openId} onBack={() => { setOpenId(null); load() }} />
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar" style={{ background: 'var(--ws-bg)' }}>
      <div className="px-5 pt-4 pb-28 max-w-lg mx-auto">
        <motion.button whileTap={{ scale: 0.95 }} onClick={onBack}
          className="font-semibold text-sm flex items-center gap-1 mb-3" style={{ color: ACCENT }}>
          <ArrowLeft size={16} /> {t('series.back')}
        </motion.button>

        <div className="mb-5">
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--ws-text)' }}>
            <ListVideo size={26} style={{ color: ACCENT }} />
            {t('series.title')}
          </h1>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-9 h-9 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: ACCENT, borderTopColor: 'transparent' }} />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-16">
            <Frown size={36} style={{ color: 'var(--ws-muted)' }} />
            <p className="font-bold" style={{ color: 'var(--ws-text)' }}>{t('series.loadError')}</p>
            <button onClick={load} className="px-5 py-2.5 rounded-btn text-sm font-bold flex items-center gap-2"
              style={{ background: 'var(--ws-card-2)', color: 'var(--ws-text)' }}>
              <RotateCcw size={14} /> {t('cinema.retry')}
            </button>
          </div>
        )}

        {!loading && !error && playlists.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Inbox size={34} style={{ color: ACCENT }} />
            <p className="font-bold text-lg" style={{ color: 'var(--ws-text)' }}>{t('series.empty')}</p>
          </div>
        )}

        {!loading && !error && playlists.length > 0 && (
          <div className="flex flex-col gap-3">
            {playlists.map((p, i) => (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.4) }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setOpenId(p.id)}
                className="w-full flex items-center gap-3 p-4 ws-card text-left"
              >
                <div className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: `${ACCENT}1f`, border: `1px solid ${ACCENT}44` }}>
                  <ListVideo size={22} style={{ color: ACCENT }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[15px] truncate" style={{ color: 'var(--ws-text)' }}>{p.title}</p>
                    {p.assigned && (
                      <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide"
                        style={{ color: '#8B5CF6', background: 'rgba(139,92,246,0.15)' }}>
                        {t('series.assigned')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {p.level && <span className="text-[10px] font-bold" style={{ color: ACCENT }}>{p.level}</span>}
                    <span className="text-xs" style={{ color: 'var(--ws-muted)' }}>
                      {t('series.videoCount', { count: p.itemCount })}
                    </span>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
