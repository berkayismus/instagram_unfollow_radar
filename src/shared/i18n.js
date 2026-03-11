/**
 * @fileoverview Internationalization module for Instagram Unfollow Radar Extension
 * @description Handles loading and applying translations for multiple languages
 * @version 1.0.0
 */

const I18n = (function () {
    'use strict';

    let currentLocale = 'tr';
    let translations = {};
    const supportedLocales = ['tr', 'en'];
    const translationCache = {};

    async function loadTranslations(locale) {
        if (translationCache[locale]) {
            translations = translationCache[locale];
            return true;
        }
        try {
            const response = await fetch(chrome.runtime.getURL(`locales/${locale}.json`));
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            translations = await response.json();
            translationCache[locale] = translations;
            return true;
        } catch (error) {
            console.error(`Failed to load translations for ${locale}:`, error);
            if (locale !== 'tr') return loadTranslations('tr');
            return false;
        }
    }

    function applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = t(key);
            if (translation && translation !== key) element.textContent = translation;
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const translation = t(key);
            if (translation && translation !== key) element.placeholder = translation;
        });

        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const translation = t(key);
            if (translation && translation !== key) element.title = translation;
        });

        document.querySelectorAll('[data-i18n-aria]').forEach(element => {
            const key = element.getAttribute('data-i18n-aria');
            const translation = t(key);
            if (translation && translation !== key) element.setAttribute('aria-label', translation);
        });

        const langToggle = document.getElementById('langToggle');
        if (langToggle) {
            langToggle.textContent = t('language.current');
            langToggle.title = t('language.toggle');
        }
    }

    async function init() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.LANGUAGE]);
        currentLocale = data[Constants.STORAGE_KEYS.LANGUAGE] || 'tr';
        if (!supportedLocales.includes(currentLocale)) currentLocale = 'tr';
        await loadTranslations(currentLocale);
        applyTranslations();
        return currentLocale;
    }

    function t(keyPath, replacements = {}) {
        if (!keyPath || typeof keyPath !== 'string') return keyPath || '';
        const keys = keyPath.split('.');
        let value = translations;
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return keyPath;
            }
        }
        if (typeof value === 'string') {
            Object.keys(replacements).forEach(placeholder => {
                value = value.replace(new RegExp(`{${placeholder}}`, 'g'), replacements[placeholder]);
            });
        }
        return value;
    }

    async function setLocale(locale) {
        if (!supportedLocales.includes(locale)) return false;
        currentLocale = locale;
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.LANGUAGE]: locale });
        await loadTranslations(locale);
        applyTranslations();
        return true;
    }

    async function toggleLocale() {
        const currentIndex = supportedLocales.indexOf(currentLocale);
        const nextLocale = supportedLocales[(currentIndex + 1) % supportedLocales.length];
        await setLocale(nextLocale);
        return nextLocale;
    }

    function getLocale() { return currentLocale; }
    function getSupportedLocales() { return [...supportedLocales]; }
    function isSupported(locale) { return supportedLocales.includes(locale); }

    return { init, t, setLocale, toggleLocale, getLocale, getSupportedLocales, isSupported, applyTranslations };
})();

if (typeof window !== 'undefined') window.I18n = I18n;
