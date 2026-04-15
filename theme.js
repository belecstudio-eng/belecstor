const THEME_STORAGE_KEY = 'siteTheme';
const DEFAULT_THEME = 'midnight';

function normalizeTheme(theme) {
    return theme === 'midnight' ? 'midnight' : 'light';
}

function getStoredTheme() {
    try {
        const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        return storedTheme ? normalizeTheme(storedTheme) : DEFAULT_THEME;
    } catch (error) {
        return DEFAULT_THEME;
    }
}

function updateThemeControls(theme) {
    const resolvedTheme = normalizeTheme(theme);
    const labels = document.querySelectorAll('[data-theme-toggle-text]');
    const states = document.querySelectorAll('[data-theme-toggle-state]');
    const icons = document.querySelectorAll('[data-theme-toggle-icon]');

    labels.forEach((label) => {
        label.textContent = resolvedTheme === 'midnight' ? 'Mode clair' : 'Mode nuit';
    });

    states.forEach((state) => {
        state.textContent = resolvedTheme === 'midnight' ? 'Nuit' : 'Clair';
    });

    icons.forEach((icon) => {
        icon.classList.toggle('fa-moon', resolvedTheme !== 'midnight');
        icon.classList.toggle('fa-sun', resolvedTheme === 'midnight');
    });
}

function applyTheme(theme, persist = true) {
    const resolvedTheme = normalizeTheme(theme);

    if (document.body) {
        document.body.dataset.theme = resolvedTheme;
    }

    if (persist) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
        } catch (error) {
            // Ignore storage write issues.
        }
    }

    updateThemeControls(resolvedTheme);
    return resolvedTheme;
}

function toggleTheme() {
    const nextTheme = document.body && document.body.dataset.theme === 'midnight' ? 'light' : 'midnight';
    return applyTheme(nextTheme);
}

function bindThemeButtons() {
    const buttons = document.querySelectorAll('[data-theme-toggle]');

    buttons.forEach((button) => {
        if (button.dataset.themeBound === 'true') {
            return;
        }

        button.dataset.themeBound = 'true';
        button.addEventListener('click', toggleTheme);
    });
}

function initThemeControls() {
    bindThemeButtons();
    applyTheme(getStoredTheme(), false);
}

window.SiteTheme = {
    applyTheme,
    getStoredTheme,
    initThemeControls,
    toggleTheme
};

window.addEventListener('storage', (event) => {
    if (event.key === THEME_STORAGE_KEY) {
        applyTheme(event.newValue || DEFAULT_THEME, false);
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeControls);
} else {
    initThemeControls();
}