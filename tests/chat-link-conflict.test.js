import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { archiveDisplacedChatLinkMemo } from '../src/features/chat/chat-link-conflict.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(path.join(root, '..', 'index.js'), 'utf8');

describe('archiveDisplacedChatLinkMemo', () => {
    it('archives a string memo and keeps dungeonMapHistory paired', () => {
        const target = {
            memoHistory: ['older'],
            dungeonMapHistory: [{ maps: [{ uid: '1' }] }],
        };
        expect(archiveDisplacedChatLinkMemo(target, '[TIME]\nDay 2\n[/TIME]')).toBe(true);
        expect(target.memoHistory).toEqual(['[TIME]\nDay 2\n[/TIME]', 'older']);
        expect(target.dungeonMapHistory).toEqual([null, { maps: [{ uid: '1' }] }]);
        expect(typeof target.memoHistory[0]).toBe('string');
    });

    it('refuses object stones that would poison Linear Stone History', () => {
        const target = { memoHistory: [], dungeonMapHistory: [] };
        expect(archiveDisplacedChatLinkMemo(target, {
            memo: '[TIME]\nDay 2\n[/TIME]',
            delta: 'x',
            timestamp: 1,
            label: 'Global Edit (Pre-Link)',
        })).toBe(false);
        expect(target.memoHistory).toEqual([]);
        expect(target.dungeonMapHistory).toEqual([]);
    });

    it('caps history length at 50 by default', () => {
        const target = {
            memoHistory: Array.from({ length: 50 }, (_, i) => `m${i}`),
            dungeonMapHistory: Array.from({ length: 50 }, () => null),
        };
        archiveDisplacedChatLinkMemo(target, 'newest');
        expect(target.memoHistory).toHaveLength(50);
        expect(target.memoHistory[0]).toBe('newest');
        expect(target.dungeonMapHistory).toHaveLength(50);
    });
});

describe('Chat Link conflict wiring', () => {
    it('uses archiveDisplacedChatLinkMemo for RESTORE and OVERWRITE', () => {
        const toggleStart = indexSource.indexOf('async function applyChatLinkToggle');
        const toggleEnd = indexSource.indexOf('function updatePanelStatus', toggleStart);
        const slice = indexSource.slice(toggleStart, toggleEnd);
        expect(slice).toContain('archiveDisplacedChatLinkMemo(saved, s.currentMemo)');
        expect(slice).toContain('archiveDisplacedChatLinkMemo(s, saved.currentMemo)');
        expect(slice).not.toContain("label: 'Global Edit (Pre-Link)'");
        expect(slice).not.toMatch(/memoHistory\.unshift\(\s*\{/);
    });
});
