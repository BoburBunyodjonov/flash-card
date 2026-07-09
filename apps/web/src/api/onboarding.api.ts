import { api } from './client'

export interface TestQuestion {
  wordId: string
  word: string
  pronunciation: string | null
  difficulty: string
  choices: string[]
  correctIndex: number
}

export const onboardingApi = {
  getLevelTest: (): Promise<TestQuestion[]> =>
    api.get('/api/onboarding/level-test').then(r => r.data.data.questions),
  complete: (level: string) =>
    api.post('/api/onboarding/complete', { level }),
  skip: () => api.post('/api/onboarding/skip'),
}
