import { SPACED_REPETITION_INTERVALS } from '@wordswipe/shared'

export type SwipeQuality = 'right' | 'left'

interface SM2Result {
  strength: number
  nextReview: Date
  reviewCount: number
  status: 'new' | 'learning' | 'learned' | 'mastered'
}

export function calculateNextReview(
  quality: SwipeQuality,
  currentStrength: number,
  reviewCount: number,
): SM2Result {
  let newStrength = currentStrength
  let newReviewCount = reviewCount

  if (quality === 'left') {
    newStrength = Math.max(0, currentStrength - 20)
    // A lapse resets the schedule so the word returns tomorrow (interval
    // index 0 = 1 day). Decrementing by 1 left a failed mature word stuck on
    // a ~30-day interval — the opposite of what review should do.
    newReviewCount = 0
  } else {
    newStrength = Math.min(100, currentStrength + 15)
    newReviewCount = reviewCount + 1
  }

  const intervalIndex = Math.min(newReviewCount, SPACED_REPETITION_INTERVALS.length - 1)
  const days = SPACED_REPETITION_INTERVALS[intervalIndex]

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + days)

  let status: SM2Result['status'] = 'learning'
  if (newStrength === 0) status = 'new'
  else if (newStrength < 40) status = 'learning'
  else if (newStrength < 80) status = 'learned'
  else status = 'mastered'

  return { strength: newStrength, nextReview, reviewCount: newReviewCount, status }
}
