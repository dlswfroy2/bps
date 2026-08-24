'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import Script from 'next/script';

type Language = 'bn' | 'en';

interface LanguageContextType {
  currentLang: Language;
  switchLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  currentLang: 'bn',
  switchLanguage: () => {},
});

// Safeguard React DOM reconciliation against Google Translate DOM modifications
if (typeof window !== 'undefined' && typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      if (child.parentNode) {
        return child.parentNode.removeChild(child) as T;
      }
      return child;
    }
    return originalRemoveChild.apply(this, [child]) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (referenceNode.parentNode) {
        return referenceNode.parentNode.insertBefore(newNode, referenceNode) as T;
      }
      return newNode;
    }
    return originalInsertBefore.apply(this, [newNode, referenceNode]) as T;
  };
}

export function GoogleTranslateProvider({ children }: { children: ReactNode }) {
  const [currentLang, setCurrentLang] = useState<Language>('bn');

  useEffect(() => {
    // Check existing cookie on mount
    const match = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
    if (match) {
      const val = decodeURIComponent(match[1]);
      if (val.includes('/en')) {
        setCurrentLang('en');
      } else {
        setCurrentLang('bn');
      }
    }

    // Force remove any Google Translate top banner from pushing or covering the header
    const cleanGoogleBanner = () => {
      if (document.body.style.top && document.body.style.top !== '0px') {
        document.body.style.top = '0px';
      }
      const banners = document.querySelectorAll('.goog-te-banner-frame, iframe.skiptranslate, .VIpgJd-ZVi9od-ORHb-OEVmcd, .VIpgJd-ZVi9od-ORHb');
      banners.forEach(b => {
        (b as HTMLElement).style.display = 'none';
        (b as HTMLElement).style.visibility = 'hidden';
        (b as HTMLElement).style.height = '0px';
        (b as HTMLElement).style.width = '0px';
      });

      // Fix "Sixth grade", "9th grade", "8th grade", etc. to "Class 6", "Class 7", etc. in English mode
      const isEn = document.cookie.includes('googtrans=/bn/en') || 
                   document.documentElement.classList.contains('translated-ltr') ||
                   (document.querySelector('.goog-te-combo') as HTMLSelectElement)?.value === 'en';

      if (isEn) {
        const gradePatterns: [RegExp, string][] = [
          [/\b(?:sixth|6th)\s+grade\b/gi, 'Class 6'],
          [/\b(?:seventh|7th)\s+grade\b/gi, 'Class 7'],
          [/\b(?:eighth|8th)\s+grade\b/gi, 'Class 8'],
          [/\b(?:ninth|9th)\s+grade\b/gi, 'Class 9'],
          [/\b(?:tenth|10th)\s+grade\b/gi, 'Class 10'],
          [/\b(?:sixth|6th)\s+class\b/gi, 'Class 6'],
          [/\b(?:seventh|7th)\s+class\b/gi, 'Class 7'],
          [/\b(?:eighth|8th)\s+class\b/gi, 'Class 8'],
          [/\b(?:ninth|9th)\s+class\b/gi, 'Class 9'],
          [/\b(?:tenth|10th)\s+class\b/gi, 'Class 10'],
          [/\bgrade\s+(?:6|6th)\b/gi, 'Class 6'],
          [/\bgrade\s+(?:7|7th)\b/gi, 'Class 7'],
          [/\bgrade\s+(?:8|8th)\b/gi, 'Class 8'],
          [/\bgrade\s+(?:9|9th)\b/gi, 'Class 9'],
          [/\bgrade\s+(?:10|10th)\b/gi, 'Class 10'],
          [/\bScience\s*-\s*Peace\b/gi, 'Science - Shanti Ara'],
          [/\bPeace\b/gi, 'Shanti Ara'],
        ];

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (!node.nodeValue) continue;
          let text = node.nodeValue;
          let changed = false;
          for (const [regex, replacement] of gradePatterns) {
            if (regex.test(text)) {
              text = text.replace(regex, replacement);
              changed = true;
            }
          }
          if (changed) {
            node.nodeValue = text;
          }
        }
      }
    };

    cleanGoogleBanner();
    const interval = setInterval(cleanGoogleBanner, 200);

    const observer = new MutationObserver(cleanGoogleBanner);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  const switchLanguage = useCallback((lang: Language) => {
    setCurrentLang(lang);
    
    // Set cookies for Google Translate
    const domain = window.location.hostname;
    const isLocalhost = domain === 'localhost' || domain === '127.0.0.1';
    
    if (lang === 'en') {
      document.cookie = `googtrans=/bn/en; path=/; max-age=31536000`;
      if (!isLocalhost) {
        document.cookie = `googtrans=/bn/en; domain=.${domain}; path=/; max-age=31536000`;
      }
    } else {
      document.cookie = `googtrans=/bn/bn; path=/; max-age=31536000`;
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      if (!isLocalhost) {
        document.cookie = `googtrans=/bn/bn; domain=.${domain}; path=/; max-age=31536000`;
        document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=.${domain}; path=/;`;
      }
    }

    // Attempt to trigger select element directly if loaded
    const selectElem = document.querySelector('.goog-te-combo') as HTMLSelectElement | null;
    if (selectElem) {
      selectElem.value = lang;
      selectElem.dispatchEvent(new Event('change'));
    }
    
    // Reload to ensure full and clean translation across all dynamic components
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }, []);

  return (
    <LanguageContext.Provider value={{ currentLang, switchLanguage }}>
      {children}
      {/* Hidden container for Google Translate Widget */}
      <div id="google_translate_element" style={{ display: 'none', position: 'absolute', top: '-9999px', left: '-9999px' }} />
      <Script
        id="google-translate-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            function googleTranslateElementInit() {
              new google.translate.TranslateElement({
                pageLanguage: 'bn',
                includedLanguages: 'bn,en',
                autoDisplay: false
              }, 'google_translate_element');
            }
          `,
        }}
      />
      <Script
        id="google-translate-script"
        strategy="afterInteractive"
        src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
      />
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
