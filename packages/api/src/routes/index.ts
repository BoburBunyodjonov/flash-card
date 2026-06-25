import type { FastifyInstance } from 'fastify'
import { authRoutes } from './auth.route'
import { feedRoutes } from './feed.route'
import { wordsRoutes } from './words.route'
import { decksRoutes } from './decks.route'
import { progressRoutes } from './progress.route'
import { leaderboardRoutes } from './leaderboard.route'
import { profileRoutes } from './profile.route'
import { requireAdmin } from '../middlewares/auth.middleware'
import { adminWordsRoutes } from './admin/words.route'
import { adminCategoriesRoutes } from './admin/categories.route'
import { adminUsersRoutes } from './admin/users.route'
import { adminSettingsRoutes } from './admin/settings.route'
import { adminAnalyticsRoutes } from './admin/analytics.route'
import { adminNotificationsRoutes } from './admin/notifications.route'
import { challengeRoutes } from './challenge.route'
import { categoriesRoutes } from './categories.route'
import { onboardingRoutes } from './onboarding.route'
import { quizRoutes } from './quiz.route'
import { duelRoutes } from './duel.route'
import { leagueRoutes } from './league.route'
import { paymentsRoutes } from './payments.route'
import { speakingRoutes } from './speaking.route'

export async function registerRoutes(fastify: FastifyInstance) {
  fastify.register(authRoutes, { prefix: '/api/auth' })
  fastify.register(feedRoutes, { prefix: '/api/feed' })
  fastify.register(wordsRoutes, { prefix: '/api/words' })
  fastify.register(decksRoutes, { prefix: '/api/decks' })
  fastify.register(progressRoutes, { prefix: '/api/progress' })
  fastify.register(leaderboardRoutes, { prefix: '/api/leaderboard' })
  fastify.register(profileRoutes, { prefix: '/api' })
  fastify.register(challengeRoutes, { prefix: '/api/challenge' })
  fastify.register(categoriesRoutes, { prefix: '/api/categories' })
  fastify.register(onboardingRoutes, { prefix: '/api/onboarding' })
  fastify.register(quizRoutes, { prefix: '/api/quiz' })
  fastify.register(duelRoutes, { prefix: '/api/duel' })
  fastify.register(leagueRoutes, { prefix: '/api/league' })
  fastify.register(paymentsRoutes, { prefix: '/api/payments' })
  fastify.register(speakingRoutes, { prefix: '/api/speaking' })

  fastify.register(
    async (adminApp) => {
      adminApp.addHook('onRequest', requireAdmin)
      adminApp.register(adminWordsRoutes, { prefix: '/words' })
      adminApp.register(adminCategoriesRoutes, { prefix: '/categories' })
      adminApp.register(adminUsersRoutes, { prefix: '/users' })
      adminApp.register(adminSettingsRoutes, { prefix: '/settings' })
      adminApp.register(adminAnalyticsRoutes, { prefix: '/analytics' })
      adminApp.register(adminNotificationsRoutes, { prefix: '/notifications' })
    },
    { prefix: '/api/admin' },
  )
}
