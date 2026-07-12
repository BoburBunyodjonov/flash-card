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
import { adminSpeakingRoutes } from './admin/speaking.route'
import { challengeRoutes } from './challenge.route'
import { categoriesRoutes } from './categories.route'
import { onboardingRoutes } from './onboarding.route'
import { quizRoutes } from './quiz.route'
import { duelRoutes } from './duel.route'
import { leagueRoutes } from './league.route'
import { paymentsRoutes } from './payments.route'
import { speakingRoutes } from './speaking.route'
import { myWordsRoutes } from './my-words.route'
import { groupChallengeRoutes } from './group-challenge.route'
import { pushTokenRoutes } from './push-token.route'
import { shadowingRoutes } from './shadowing.route'
import { adminShadowingRoutes } from './admin/shadowing.route'
import { adminPartnersRoutes } from './admin/partners.route'
import { integrationsV1Routes } from './integrations/v1.route'
import { teacherRoutes } from './teacher.route'
import { mediaRoutes } from './media.route'

export async function registerRoutes(fastify: FastifyInstance) {
  fastify.register(authRoutes, { prefix: '/api/auth' })
  fastify.register(mediaRoutes, { prefix: '/api/media' })
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
  fastify.register(myWordsRoutes, { prefix: '/api/my-words' })
  fastify.register(groupChallengeRoutes, { prefix: '/api/group-challenge' })
  fastify.register(pushTokenRoutes, { prefix: '/api' })
  fastify.register(shadowingRoutes, { prefix: '/api/shadowing' })

  // Universal ERP integration API (API-key auth, versioned)
  fastify.register(integrationsV1Routes, { prefix: '/api/integrations/v1' })
  fastify.register(teacherRoutes, { prefix: '/api/teacher' })

  fastify.register(
    async (adminApp) => {
      adminApp.addHook('onRequest', requireAdmin)
      adminApp.register(adminWordsRoutes, { prefix: '/words' })
      adminApp.register(adminCategoriesRoutes, { prefix: '/categories' })
      adminApp.register(adminUsersRoutes, { prefix: '/users' })
      adminApp.register(adminSettingsRoutes, { prefix: '/settings' })
      adminApp.register(adminAnalyticsRoutes, { prefix: '/analytics' })
      adminApp.register(adminNotificationsRoutes, { prefix: '/notifications' })
      adminApp.register(adminSpeakingRoutes, { prefix: '/speaking' })
      adminApp.register(adminShadowingRoutes, { prefix: '/shadowing' })
      adminApp.register(adminPartnersRoutes, { prefix: '/partners' })
    },
    { prefix: '/api/admin' },
  )
}
