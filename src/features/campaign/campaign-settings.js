// Campaign Director settings drawer bindings (settings.html #rpg_campaign_director_drawer).

import { saveSettings } from '../../app/runtime-bridge.js';
import {
    openCampaignSessionZero, endCampaign, formatCampaignStatus, getCampaign,
    registerCampaignSlashCommand, installCampaignEventHandlers,
} from './campaign-runtime.js';

export { registerCampaignSlashCommand, installCampaignEventHandlers };

/** @param {Record<string, any>} settings */
export function bindCampaignDirectorSettings(settings) {
    const root = document.getElementById('rpg_campaign_director_drawer');
    if (!root || root.dataset.rtCampaignBound === '1') return;
    root.dataset.rtCampaignBound = '1';

    const bindCheck = (id, key, defaultOn) => {
        const el = /** @type {HTMLInputElement|null} */ (document.getElementById(id));
        if (!el) return;
        el.checked = defaultOn ? settings[key] !== false : !!settings[key];
        el.addEventListener('change', () => {
            settings[key] = el.checked;
            saveSettings();
        });
    };
    const bindText = (id, key) => {
        const el = /** @type {HTMLTextAreaElement|null} */ (document.getElementById(id));
        if (!el) return;
        el.value = settings[key] || '';
        el.addEventListener('input', () => {
            settings[key] = el.value;
            saveSettings();
        });
    };

    bindCheck('rpg_campaign_redirect', 'campaignRedirectEnabled', false);
    bindCheck('rpg_campaign_consolidate', 'campaignConsolidateEnabled', true);
    bindText('rpg_campaign_architect_prompt', 'campaignArchitectSystemPrompt');
    bindText('rpg_campaign_chronicler_prompt', 'campaignChroniclerSystemPrompt');

    const lookback = /** @type {HTMLInputElement|null} */ (document.getElementById('rpg_campaign_lookback'));
    if (lookback) {
        lookback.value = String(settings.campaignChroniclerLookback ?? 4);
        lookback.addEventListener('input', () => {
            const n = Number.parseInt(lookback.value, 10);
            settings.campaignChroniclerLookback = Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : 4;
            saveSettings();
        });
    }

    document.getElementById('rpg_campaign_begin')?.addEventListener('click', (e) => {
        e.preventDefault();
        void openCampaignSessionZero({ source: 'settings' });
    });
    document.getElementById('rpg_campaign_end')?.addEventListener('click', (e) => {
        e.preventDefault();
        void endCampaign();
    });
    document.getElementById('rpg_campaign_status')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const { Popup } = SillyTavern.getContext();
        const text = formatCampaignStatus(getCampaign(), { reveal: false });
        await Popup?.show?.text?.('Campaign', `<pre style="white-space:pre-wrap; text-align:left; font-family:inherit;">${text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`);
    });
}
