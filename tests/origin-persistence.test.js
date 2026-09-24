import { beforeEach, describe, expect, it } from 'vitest';

import { getSettings, saveChatState } from '../state-manager.js';
import { partitionHasCampaignSubstance, partitionLooksEmpty } from '../src/features/chat/chat-rename-migrate.js';
import { getFactoryCartridgePayload, CARTRIDGE_PAYLOAD_GROUPS } from '../src/state/factory-and-diff.js';
import { testExtensionSettings } from './setup.js';

describe('Origin record persistence', () => {
    beforeEach(() => {
        for (const key of Object.keys(testExtensionSettings)) delete testExtensionSettings[key];
    });

    it('saveChatState keeps the origin record written outside the normal save cycle', () => {
        const s = getSettings();
        const origin = { version: 1, originId: 'oathbreaker', profile: { secrets: [{ secret: 'x' }] } };
        s.chatStates = { 'Chat A': { origin } };
        saveChatState('Chat A', { skipDiskWrite: true });
        expect(s.chatStates['Chat A'].origin).toEqual(origin);
    });

    it('a partition holding only an origin counts as campaign substance', () => {
        const partition = { origin: { version: 1, originId: 'cultist' } };
        expect(partitionHasCampaignSubstance(partition)).toBe(true);
        expect(partitionLooksEmpty(partition)).toBe(false);
        expect(partitionHasCampaignSubstance({ origin: null })).toBe(false);
    });

    it('Game Cartridges carry the Origin System settings', () => {
        const payload = getFactoryCartridgePayload();
        expect(payload.originInjectEnabled).toBe(true);
        expect(payload.originArchitectSystemPrompt).toBe('');
        const group = CARTRIDGE_PAYLOAD_GROUPS.find(g => g.id === 'origins');
        expect(group.keys).toEqual(['originInjectEnabled', 'originArchitectSystemPrompt']);
    });
});
