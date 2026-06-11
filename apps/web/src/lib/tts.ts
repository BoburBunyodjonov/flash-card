// Audio pronunciation: real recording when available, browser TTS as fallback.
// TTS works offline and needs no API key, so every word is always speakable.

let voice: SpeechSynthesisVoice | null = null

function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (voice) return voice
  const voices = window.speechSynthesis?.getVoices() ?? []
  voice =
    voices.find((v) => v.lang === 'en-US' && v.localService) ??
    voices.find((v) => v.lang === 'en-US') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null
  return voice
}

// Voices load asynchronously in some browsers
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => { voice = null; pickEnglishVoice() }
}

export function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'en-US'
  utter.rate = 0.9
  const v = pickEnglishVoice()
  if (v) utter.voice = v
  window.speechSynthesis.speak(utter)
}

/** Plays the recorded audio if present, otherwise falls back to TTS. */
export function playWordAudio(word: string, audioUrl?: string | null) {
  if (audioUrl) {
    const audio = new Audio(audioUrl)
    audio.play().catch(() => speak(word))
  } else {
    speak(word)
  }
}
