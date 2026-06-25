import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/auth.store'
import { useTelegram } from '../../hooks/useTelegram'
import { speakingApi, type SpeakingPartner, type SpeakingTopics } from '../../api/speaking.api'

// ── State machine ─────────────────────────────────────────────────────────────
// intro → (mic check) → searching → call → summary
//                ↘ mic-error          ↘ error (WS/RTC failure)
type Stage = 'intro' | 'mic-error' | 'searching' | 'call' | 'summary' | 'error'

interface SignalPayload {
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

type ServerMsg =
  | { type: 'searching' }
  | { type: 'matched'; sessionId: string; initiator: boolean; partner: SpeakingPartner }
  | { type: 'signal'; payload: SignalPayload }
  | { type: 'partner-left' }
  | { type: 'ended'; durationSec: number; xpEarned: number }
  | { type: 'error'; message: string }

function buildWsUrl(token: string): string {
  // Same origin as the HTTP API (dev: Vite proxy forwards /api with ws:true)
  const base = import.meta.env.VITE_API_URL || window.location.origin
  const u = new URL('/api/speaking/ws', base)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.searchParams.set('token', token)
  return u.toString()
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function SpeakingPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const { user, setUser } = useAuthStore()
  const { haptic, isInsideTelegram } = useTelegram()

  const [stage, setStage] = useState<Stage>('intro')
  const [sameGender, setSameGender] = useState(false)
  const [anyLevel, setAnyLevel] = useState(false)
  const [savingGender, setSavingGender] = useState(false)

  const [partner, setPartner] = useState<SpeakingPartner | null>(null)
  const [searchSec, setSearchSec] = useState(0)
  const [callSec, setCallSec] = useState(0)
  const [muted, setMuted] = useState(false)
  const [topics, setTopics] = useState<SpeakingTopics | null>(null)
  const [topicIndex, setTopicIndex] = useState(0)
  const [partnerLeft, setPartnerLeft] = useState(false)
  const [summary, setSummary] = useState<{ durationSec: number; xpEarned: number } | null>(null)
  const [rated, setRated] = useState<boolean | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportSent, setReportSent] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const stageRef = useRef<Stage>('intro')
  const wsRef = useRef<WebSocket | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const intentionalCloseRef = useRef(false)
  const initiatorRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  const callStartRef = useRef<number | null>(null)
  const pendingSignalsRef = useRef<SignalPayload[]>([])
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const endFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const partnerLeftRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { stageRef.current = stage }, [stage])

  // ── Cleanup helpers ──────────────────────────────────────────────────────
  const teardown = () => {
    intentionalCloseRef.current = true
    if (endFallbackRef.current) { clearTimeout(endFallbackRef.current); endFallbackRef.current = null }
    if (partnerLeftRef.current) { clearTimeout(partnerLeftRef.current); partnerLeftRef.current = null }
    pcRef.current?.close()
    pcRef.current = null
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    if (audioRef.current) audioRef.current.srcObject = null
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) wsRef.current.close()
    wsRef.current = null
    pendingSignalsRef.current = []
    pendingCandidatesRef.current = []
  }

  // Rigorous unmount cleanup: mic, RTCPeerConnection, WS
  useEffect(() => () => teardown(), [])

  // ── Timers ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage === 'searching') {
      setSearchSec(0)
      const id = setInterval(() => setSearchSec((s) => s + 1), 1000)
      return () => clearInterval(id)
    }
    if (stage === 'call') {
      const id = setInterval(() => {
        if (callStartRef.current) setCallSec(Math.floor((Date.now() - callStartRef.current) / 1000))
      }, 1000)
      return () => clearInterval(id)
    }
  }, [stage])

  const sendWs = (msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg))
  }

  const fail = (message?: string) => {
    teardown()
    setErrorMsg(message ?? null)
    setStage('error')
  }

  // ── WebRTC ───────────────────────────────────────────────────────────────
  const applySignal = async (payload: SignalPayload) => {
    const pc = pcRef.current
    if (!pc) { pendingSignalsRef.current.push(payload); return }
    try {
      if (payload.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        // ICE candidates that arrived before the remote description
        for (const c of pendingCandidatesRef.current) await pc.addIceCandidate(c).catch(() => {})
        pendingCandidatesRef.current = []
        if (payload.sdp.type === 'offer') {
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          sendWs({ type: 'signal', payload: { sdp: answer } })
        }
      } else if (payload.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(payload.candidate).catch(() => {})
        else pendingCandidatesRef.current.push(payload.candidate)
      }
    } catch {
      fail()
    }
  }

  const startPeerConnection = async () => {
    try {
      const { iceServers } = await speakingApi.getIce()
      const pc = new RTCPeerConnection({ iceServers })
      pcRef.current = pc
      const stream = streamRef.current
      if (stream) stream.getTracks().forEach((tr) => pc.addTrack(tr, stream))
      pc.onicecandidate = (e) => {
        if (e.candidate) sendWs({ type: 'signal', payload: { candidate: e.candidate.toJSON() } })
      }
      pc.ontrack = (e) => {
        if (audioRef.current && e.streams[0]) audioRef.current.srcObject = e.streams[0]
      }
      // Signals that arrived while we were fetching ICE servers
      const pending = pendingSignalsRef.current
      pendingSignalsRef.current = []
      for (const p of pending) await applySignal(p)
      if (initiatorRef.current) {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        sendWs({ type: 'signal', payload: { sdp: offer } })
      }
    } catch {
      fail()
    }
  }

  // ── Call end → summary ───────────────────────────────────────────────────
  const goSummary = (data?: { durationSec: number; xpEarned: number }) => {
    if (endFallbackRef.current) { clearTimeout(endFallbackRef.current); endFallbackRef.current = null }
    if (partnerLeftRef.current) { clearTimeout(partnerLeftRef.current); partnerLeftRef.current = null }
    const localDur = callStartRef.current ? Math.floor((Date.now() - callStartRef.current) / 1000) : 0
    setSummary((prev) => data ?? prev ?? { durationSec: localDur, xpEarned: 0 })
    teardown()
    setStage('summary')
  }

  // ── WS message handler ───────────────────────────────────────────────────
  const handleMessage = (raw: MessageEvent) => {
    let msg: ServerMsg
    try { msg = JSON.parse(raw.data as string) } catch { return }

    switch (msg.type) {
      case 'searching':
        break
      case 'matched':
        sessionIdRef.current = msg.sessionId
        initiatorRef.current = msg.initiator
        callStartRef.current = Date.now()
        setPartner(msg.partner)
        setCallSec(0)
        setStage('call')
        haptic.success()
        speakingApi.getTopics().then(setTopics).catch(() => {})
        void startPeerConnection()
        break
      case 'signal':
        void applySignal(msg.payload)
        break
      case 'partner-left':
        setPartnerLeft(true)
        haptic.impact('medium')
        // Server usually follows with 'ended'; fall back to a local summary if it doesn't
        partnerLeftRef.current = setTimeout(() => {
          if (stageRef.current === 'call') goSummary()
        }, 2000)
        break
      case 'ended':
        goSummary({ durationSec: msg.durationSec, xpEarned: msg.xpEarned })
        break
      case 'error':
        fail(msg.message)
        break
    }
  }

  // ── Find partner (mic check → WS → queue) ────────────────────────────────
  const startSearch = async () => {
    haptic.impact('light')
    // Reset per-session state
    setPartner(null)
    setTopics(null)
    setTopicIndex(0)
    setPartnerLeft(false)
    setSummary(null)
    setRated(null)
    setReportOpen(false)
    setReportReason('')
    setReportSent(false)
    setMuted(false)
    setErrorMsg(null)
    sessionIdRef.current = null
    callStartRef.current = null

    // Never enter the queue without a working mic
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setStage('mic-error')
      return
    }

    const token = localStorage.getItem('accessToken') ?? ''
    try {
      intentionalCloseRef.current = false
      const ws = new WebSocket(buildWsUrl(token))
      wsRef.current = ws
      ws.onopen = () => sendWs({ type: 'find', filters: { sameGender, anyLevel } })
      ws.onmessage = handleMessage
      ws.onclose = () => {
        if (intentionalCloseRef.current) return
        if (stageRef.current === 'call') goSummary()
        else if (stageRef.current === 'searching') fail()
      }
      ws.onerror = () => {
        if (!intentionalCloseRef.current && stageRef.current === 'searching') fail()
      }
      setStage('searching')
    } catch {
      fail()
    }
  }

  const cancelSearch = () => {
    haptic.impact('light')
    sendWs({ type: 'cancel' })
    teardown()
    setStage('intro')
  }

  const endCall = () => {
    haptic.impact('medium')
    sendWs({ type: 'end' })
    // If the server's 'ended' never arrives, don't leave the user on a dead call
    endFallbackRef.current = setTimeout(() => {
      if (stageRef.current === 'call') goSummary()
    }, 3000)
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    haptic.impact('light')
    streamRef.current?.getAudioTracks().forEach((tr) => { tr.enabled = !next })
  }

  const saveGender = async (gender: 'male' | 'female') => {
    if (!user || savingGender) return
    setSavingGender(true)
    try {
      await speakingApi.setGender(gender)
      setUser({ ...user, gender })
      haptic.success()
    } catch {
      haptic.error()
    } finally {
      setSavingGender(false)
    }
  }

  const ratePartner = async (liked: boolean) => {
    if (rated !== null || !sessionIdRef.current) return
    setRated(liked)
    haptic.impact('light')
    await speakingApi.rate(sessionIdRef.current, liked).catch(() => {})
  }

  const submitReport = async () => {
    if (!sessionIdRef.current || !reportReason.trim()) return
    await speakingApi.report(sessionIdRef.current, reportReason.trim()).catch(() => {})
    setReportSent(true)
    setReportOpen(false)
    haptic.success()
  }

  const handleBack = () => {
    teardown()
    onBack()
  }

  const hasGender = !!user?.gender

  // ── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#0a0a14' }}>
      {/* Remote audio sink — always mounted so refs survive stage changes */}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-2 shrink-0">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={stage === 'searching' ? cancelSearch : handleBack}
          className="text-white/50 font-bold text-sm py-1 pr-2"
        >
          ← {t('speaking.back')}
        </motion.button>
        <h1 className="text-lg font-black gradient-text">🎙️ {t('speaking.title')}</h1>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
        <AnimatePresence mode="wait">

          {/* ── INTRO / FILTERS ── */}
          {stage === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="px-5 pt-3 flex flex-col gap-4"
            >
              {/* Explanation card */}
              <div className="rounded-2xl p-5 text-center"
                style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 220 }}
                  className="text-6xl mb-3"
                >
                  🗣️
                </motion.div>
                <p className="text-white font-black text-lg mb-1">{t('speaking.introTitle')}</p>
                <p className="text-white/45 text-sm leading-relaxed">{t('speaking.introDesc')}</p>
              </div>

              {/* Filters */}
              <div className="rounded-2xl p-5 flex flex-col gap-4"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>

                {/* Same gender toggle */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm">{t('speaking.sameGender')}</p>
                    {!hasGender && (
                      <p className="text-xs mt-0.5" style={{ color: '#f59e0b' }}>{t('speaking.sameGenderHint')}</p>
                    )}
                  </div>
                  <button
                    onClick={() => hasGender && setSameGender((v) => !v)}
                    disabled={!hasGender}
                    className="relative w-12 h-6 rounded-full transition-all duration-200 shrink-0 disabled:opacity-40"
                    style={{ background: sameGender && hasGender ? '#6366f1' : 'rgba(255,255,255,0.1)' }}
                  >
                    <motion.div
                      className="absolute top-1 w-4 h-4 rounded-full bg-white"
                      animate={{ left: sameGender && hasGender ? '1.5rem' : '0.25rem' }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  </button>
                </div>

                {/* Inline gender picker when not set */}
                <AnimatePresence>
                  {!hasGender && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="grid grid-cols-2 gap-2 overflow-hidden"
                    >
                      <button
                        onClick={() => saveGender('male')}
                        disabled={savingGender}
                        className="py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                        style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', color: '#38bdf8' }}
                      >
                        👨 {t('speaking.male')}
                      </button>
                      <button
                        onClick={() => saveGender('female')}
                        disabled={savingGender}
                        className="py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                        style={{ background: 'rgba(244,114,182,0.1)', border: '1px solid rgba(244,114,182,0.25)', color: '#f472b6' }}
                      >
                        👩 {t('speaking.female')}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

                {/* Any level toggle */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm">{t('speaking.anyLevel')}</p>
                    <p className="text-white/30 text-xs mt-0.5">{t('speaking.anyLevelHint')}</p>
                  </div>
                  <button
                    onClick={() => setAnyLevel((v) => !v)}
                    className="relative w-12 h-6 rounded-full transition-all duration-200 shrink-0"
                    style={{ background: anyLevel ? '#6366f1' : 'rgba(255,255,255,0.1)' }}
                  >
                    <motion.div
                      className="absolute top-1 w-4 h-4 rounded-full bg-white"
                      animate={{ left: anyLevel ? '1.5rem' : '0.25rem' }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  </button>
                </div>
              </div>

              {/* Find partner */}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={startSearch}
                className="w-full py-4 rounded-2xl font-black text-base text-white glow-purple"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 32px rgba(99,102,241,0.35)' }}
              >
                🎙️ {t('speaking.findPartner')}
              </motion.button>
            </motion.div>
          )}

          {/* ── MIC ERROR ── */}
          {stage === 'mic-error' && (
            <motion.div
              key="mic-error"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="px-6 pt-10 flex flex-col items-center text-center gap-4"
            >
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 220 }} className="text-7xl">
                🎤
              </motion.div>
              <h2 className="text-xl font-black text-white">{t('speaking.micTitle')}</h2>
              <p className="text-white/40 text-sm leading-relaxed max-w-xs">
                {isInsideTelegram ? t('speaking.micTelegram') : t('speaking.micBrowser')}
              </p>
              {!isInsideTelegram && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={startSearch}
                  className="glass rounded-2xl px-6 py-3 text-white/70 font-bold text-sm"
                >
                  🔄 {t('speaking.retry')}
                </motion.button>
              )}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setStage('intro')}
                className="text-white/35 font-semibold text-sm py-2"
              >
                ← {t('speaking.back')}
              </motion.button>
            </motion.div>
          )}

          {/* ── SEARCHING ── */}
          {stage === 'searching' && (
            <motion.div
              key="searching"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="h-full flex flex-col items-center justify-center gap-8 pt-16"
            >
              {/* Pulsing rings */}
              <div className="relative w-32 h-32 flex items-center justify-center">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 rounded-full"
                    style={{ border: '2px solid rgba(99,102,241,0.4)' }}
                    animate={{ scale: [1, 1.7], opacity: [0.6, 0] }}
                    transition={{ repeat: Infinity, duration: 2, delay: i * 0.6, ease: 'easeOut' }}
                  />
                ))}
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl glow-purple"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  🎙️
                </div>
              </div>

              <div className="text-center">
                <p className="text-white font-black text-lg">{t('speaking.searching')}</p>
                <p className="text-white/35 text-sm mt-1 tabular-nums">{fmtDuration(searchSec)}</p>
              </div>

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={cancelSearch}
                className="rounded-2xl px-8 py-3.5 font-bold text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
              >
                ✕ {t('speaking.cancel')}
              </motion.button>
            </motion.div>
          )}

          {/* ── CALL ── */}
          {stage === 'call' && partner && (
            <motion.div
              key="call"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="px-5 pt-3 flex flex-col gap-4"
            >
              {/* Partner card */}
              <div className="rounded-2xl p-5 flex items-center gap-4"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="relative shrink-0">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center text-3xl"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    {partner.avatarUrl
                      ? <img src={partner.avatarUrl} className="w-full h-full object-cover" alt="" />
                      : '👤'}
                  </div>
                  <motion.div
                    className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full"
                    style={{ background: '#10b981', border: '2px solid #0a0a14' }}
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.6 }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black text-lg truncate">{partner.firstName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {partner.cefrLevel && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(99,102,241,0.15)', color: '#a78bfa' }}>
                        {partner.cefrLevel}
                      </span>
                    )}
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                      ⚡ {partner.xp} XP
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-black tabular-nums" style={{ color: '#34d399' }}>{fmtDuration(callSec)}</p>
                </div>
              </div>

              {/* Partner left notice */}
              <AnimatePresence>
                {partnerLeft && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="rounded-xl px-4 py-3 text-center text-sm font-bold"
                    style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}
                  >
                    {t('speaking.partnerLeft')}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Topics card */}
              {topics && topics.topics.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl p-5"
                  style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)' }}
                >
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">
                    💬 {t('speaking.topics')}
                  </p>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={topicIndex}
                      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.18 }}
                      className="text-white font-bold text-base leading-relaxed min-h-[3rem]"
                    >
                      {topics.topics[topicIndex % topics.topics.length]}
                    </motion.p>
                  </AnimatePresence>

                  {topics.words.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {topics.words.slice(0, 8).map((w) => (
                        <span key={w} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                          {w}
                        </span>
                      ))}
                    </div>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { haptic.impact('light'); setTopicIndex((i) => i + 1) }}
                    className="mt-4 w-full py-2.5 rounded-xl text-sm font-bold"
                    style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a78bfa' }}
                  >
                    → {t('speaking.nextTopic')}
                  </motion.button>
                </motion.div>
              )}

              {/* Call controls */}
              <div className="flex items-center justify-center gap-5 mt-2">
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={toggleMute}
                  className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
                  style={muted
                    ? { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)' }
                    : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  {muted ? '🔇' : '🎙️'}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={endCall}
                  className="w-20 h-20 rounded-full flex items-center justify-center text-3xl glow-red"
                  style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 8px 32px rgba(239,68,68,0.35)' }}
                >
                  📞
                </motion.button>
              </div>
              <p className="text-center text-white/25 text-xs font-semibold">
                {muted ? t('speaking.unmute') : t('speaking.endHint')}
              </p>
            </motion.div>
          )}

          {/* ── SUMMARY ── */}
          {stage === 'summary' && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="px-5 pt-6 flex flex-col items-center gap-5 text-center"
            >
              <motion.div
                initial={{ scale: 0, rotate: -15 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="text-7xl"
              >
                🎉
              </motion.div>
              <h2 className="text-2xl font-black gradient-text">{t('speaking.summaryTitle')}</h2>

              <div className="rounded-3xl px-8 py-5 flex gap-8 w-full max-w-xs justify-center"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-center">
                  <p className="text-3xl font-black tabular-nums" style={{ color: '#38bdf8' }}>
                    {fmtDuration(summary?.durationSec ?? 0)}
                  </p>
                  <p className="text-xs text-white/30 mt-1 font-medium">{t('speaking.duration')}</p>
                </div>
                <div className="w-px bg-white/10" />
                <div className="text-center">
                  <p className="text-3xl font-black" style={{ color: '#a78bfa' }}>+{summary?.xpEarned ?? 0}</p>
                  <p className="text-xs text-white/30 mt-1 font-medium">XP</p>
                </div>
              </div>

              {/* Rate partner */}
              {partner && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                  className="rounded-2xl p-5 w-full max-w-xs"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <p className="text-white/50 text-sm font-bold mb-3">
                    {rated === null ? t('speaking.ratePartner', { name: partner.firstName }) : t('speaking.rated')}
                  </p>
                  <div className="flex justify-center gap-4">
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={() => ratePartner(true)}
                      disabled={rated !== null}
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl disabled:opacity-40"
                      style={rated === true
                        ? { background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.45)', opacity: 1 }
                        : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      👍
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={() => ratePartner(false)}
                      disabled={rated !== null}
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl disabled:opacity-40"
                      style={rated === false
                        ? { background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.45)', opacity: 1 }
                        : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      👎
                    </motion.button>
                  </div>

                  {/* Report */}
                  {!reportSent && !reportOpen && (
                    <button
                      onClick={() => setReportOpen(true)}
                      className="text-xs font-semibold mt-4"
                      style={{ color: 'rgba(239,68,68,0.6)' }}
                    >
                      ⚠️ {t('speaking.report')}
                    </button>
                  )}
                  {reportOpen && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4">
                      <textarea
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        placeholder={t('speaking.reportPrompt')}
                        rows={2}
                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 resize-none outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                      />
                      <button
                        onClick={submitReport}
                        disabled={!reportReason.trim()}
                        className="w-full mt-2 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                        style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
                      >
                        {t('speaking.reportSubmit')}
                      </button>
                    </motion.div>
                  )}
                  {reportSent && (
                    <p className="text-xs font-semibold mt-4" style={{ color: '#34d399' }}>
                      ✓ {t('speaking.reportSent')}
                    </p>
                  )}
                </motion.div>
              )}

              <motion.button
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                whileTap={{ scale: 0.96 }}
                onClick={startSearch}
                className="w-full max-w-xs py-4 rounded-2xl font-black text-base text-white"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 32px rgba(99,102,241,0.35)' }}
              >
                🎙️ {t('speaking.findAnother')}
              </motion.button>
              <motion.button
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.32 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleBack}
                className="text-white/35 font-bold text-sm py-2"
              >
                ← {t('speaking.back')}
              </motion.button>
            </motion.div>
          )}

          {/* ── ERROR ── */}
          {stage === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="px-6 pt-12 flex flex-col items-center text-center gap-4"
            >
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 220 }} className="text-7xl">
                📡
              </motion.div>
              <h2 className="text-xl font-black text-white">{t('speaking.errorTitle')}</h2>
              <p className="text-white/40 text-sm max-w-xs">{errorMsg || t('speaking.errorMsg')}</p>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={startSearch}
                className="rounded-2xl px-8 py-3.5 font-black text-sm text-white mt-2"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                🔄 {t('speaking.retry')}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setStage('intro')}
                className="text-white/35 font-semibold text-sm py-2"
              >
                ← {t('speaking.back')}
              </motion.button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}
