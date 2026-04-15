(function () {
    async function fetchBranding() {
        const response = await fetch('/api/branding', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Impossible de charger le logo.');
        }

        return response.json();
    }

    function applyBranding(branding) {
        document.querySelectorAll('.logo').forEach((logoEl) => {
            if (!logoEl.dataset.originalHtml) {
                logoEl.dataset.originalHtml = logoEl.innerHTML;
                logoEl.dataset.logoLabel = logoEl.textContent.trim().replace(/\s+/g, ' ');
            }

            if (!branding || !branding.logoUrl) {
                logoEl.classList.remove('has-site-logo');
                logoEl.innerHTML = logoEl.dataset.originalHtml;
                return;
            }

                const label = logoEl.dataset.logoLabel || 'STUDIO BELEC';
            logoEl.classList.add('has-site-logo');
            logoEl.innerHTML = `
                <img class="site-logo-image" src="${branding.logoUrl}" alt="${label}">
                <span class="site-logo-text">${label}</span>
            `;
        });
    }

    async function loadBranding() {
        try {
            const branding = await fetchBranding();
            applyBranding(branding);
            return branding;
        } catch (error) {
            applyBranding(null);
            return null;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadBranding().catch(() => undefined);
    });

    window.SiteBranding = {
        load: loadBranding
    };
})();
