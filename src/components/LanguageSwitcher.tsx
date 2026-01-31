import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n } = useTranslation();

  const setLang = (lng: string) => i18n.changeLanguage(lng);

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <button
        aria-label="Switch to Portuguese"
        onClick={() => setLang('pt-BR')}
        className={cn(
          'px-3 py-1 rounded-md text-xs border transition-colors',
          i18n.language === 'pt-BR'
            ? 'bg-primary text-white border-transparent'
            : 'bg-transparent text-slate-500 border-border hover:bg-slate-50'
        )}
      >
        PT-BR
      </button>
      <button
        aria-label="Switch to English"
        onClick={() => setLang('en-US')}
        className={cn(
          'px-3 py-1 rounded-md text-xs border transition-colors',
          i18n.language === 'en-US'
            ? 'bg-primary text-white border-transparent'
            : 'bg-transparent text-slate-500 border-border hover:bg-slate-50'
        )}
      >
        EN
      </button>
    </div>
  );
}

export default LanguageSwitcher;
