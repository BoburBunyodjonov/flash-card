import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'

interface Deck {
  id: string
  name: string
  description?: string
  isDefault: boolean
  _count: { words: number }
}

export function DecksPage() {
  const { t } = useTranslation()
  const [decks, setDecks] = useState<Deck[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const load = () => api.get('/api/decks').then((r) => setDecks(r.data.data)).catch(console.error)

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newName.trim()) return
    await api.post('/api/decks', { name: newName })
    setNewName('')
    setShowCreate(false)
    load()
  }

  return (
    <div className="h-full flex flex-col bg-bg pt-4 pb-20">
      <div className="flex items-center justify-between px-5 mb-5">
        <h1 className="text-2xl font-black text-white">{t('nav.decks')}</h1>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowCreate(true)}
          className="bg-primary text-white font-bold px-4 py-2 rounded-xl text-sm"
        >
          + New
        </motion.button>
      </div>

      {showCreate && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-5 mb-4 bg-surface rounded-2xl p-4 flex gap-3"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Deck name..."
            className="flex-1 bg-transparent text-white outline-none placeholder-muted"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button onClick={create} className="text-primary font-bold">Create</button>
          <button onClick={() => setShowCreate(false)} className="text-muted font-bold">✕</button>
        </motion.div>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 flex flex-col gap-3">
        {decks.map((deck, i) => (
          <motion.div
            key={deck.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="bg-card rounded-2xl px-5 py-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{deck.isDefault ? '🔖' : '🗂'}</span>
              <div>
                <p className="text-white font-semibold">{deck.name}</p>
                <p className="text-muted text-xs mt-0.5">{deck._count.words} words</p>
              </div>
            </div>
            <span className="text-primary text-xl">›</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
