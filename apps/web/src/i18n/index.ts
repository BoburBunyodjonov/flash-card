import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import uz from './uz.json'
import en from './en.json'
import ru from './ru.json'

i18n.use(initReactI18next).init({
  resources: { uz: { translation: uz }, en: { translation: en }, ru: { translation: ru } },
  lng: localStorage.getItem('lang') ?? 'uz',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
