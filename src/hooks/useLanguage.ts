import { useTranslation } from 'react-i18next';

export function useLanguage() {
  const { i18n, t } = useTranslation();

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
  };

  return { 
    t, 
    currentLanguage: i18n.language, 
    changeLanguage 
  };
}
