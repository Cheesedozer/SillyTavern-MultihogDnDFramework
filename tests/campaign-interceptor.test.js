import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const hooks = readFileSync(new URL('../narrative-hooks.js', import.meta.url), 'utf8');

describe('campaign and origin injection in the interceptor', () => {
    it('never injects the Brief or origin secrets into quiet/impersonate generations', () => {
        expect(hooks).toMatch(/const campaignTurn = \(skipInjection \|\| \['quiet', 'impersonate'\]\.includes\(type\)\) \? null/);
        expect(hooks).toMatch(/originInjectEnabled !== false && !\['quiet', 'impersonate'\]\.includes\(type\)/);
    });

    it('lets campaign tempo drive the pacing tags', () => {
        expect(hooks).toContain('buildNarrativeModeTags(campaignTurn?.pacingMode || settings.narrativePacing)');
    });

    it('runs the Chronicler after the State Tracker and before World Progression', () => {
        const chronicler = hooks.indexOf('await runCampaignChroniclerPass({ generationType: currentType })');
        const stateTracker = hooks.indexOf('await globalThis._rpgRunStateModelPass(combinedNarrative)');
        const worldProgression = hooks.indexOf('chatCommitResult(ownsChat, await maybeRunWorldProgression());');
        expect(stateTracker).toBeGreaterThan(0);
        expect(chronicler).toBeGreaterThan(stateTracker);
        expect(worldProgression).toBeGreaterThan(chronicler);
    });

    it('hands campaign directives to World Progression and clears them only on success', () => {
        expect(hooks).toContain('runWorldProgressionPass(timeStr, currentMinutes, campaignDirectives)');
        expect(hooks).toContain('if (campaignDirectives && wpResult && wpResult.ok !== false) await clearCampaignWorldDirectives();');
    });
});
