'use client';

import React from 'react';
import { useLanguage } from './GoogleTranslateProvider';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  className?: string;
  variant?: 'outline' | 'default' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function LanguageSwitcher({ className, variant = 'outline', size = 'sm' }: LanguageSwitcherProps) {
  const { currentLang, switchLanguage } = useLanguage();

  return (
    <div className={cn("inline-flex items-center rounded-xl bg-white/10 p-1 border border-white/20 shadow-sm backdrop-blur-sm", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => switchLanguage('bn')}
        className={cn(
          "h-7 px-2.5 text-xs font-black rounded-lg transition-all",
          currentLang === 'bn' 
            ? "bg-white text-primary shadow-sm hover:bg-white hover:text-primary font-black" 
            : "text-white/80 hover:text-white hover:bg-white/10"
        )}
      >
        বাংলা
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => switchLanguage('en')}
        className={cn(
          "h-7 px-2.5 text-xs font-black rounded-lg transition-all",
          currentLang === 'en' 
            ? "bg-white text-primary shadow-sm hover:bg-white hover:text-primary font-black" 
            : "text-white/80 hover:text-white hover:bg-white/10"
        )}
      >
        English
      </Button>
    </div>
  );
}
