import { generateFantasyName, secureRandom } from './fantasy-names.js';

/**
 * Name pools for the non-fantasy genres. Fantasy names are built by
 * `generateFantasyName` from real medieval naming traditions instead.
 */
export const CHARACTER_NAME_POOLS = Object.freeze({
    realistic: Object.freeze({
        firstNames: Object.freeze([
            'Eleanor', 'Clara', 'Audrey', 'Evelyn', 'Violet', 'Grace',
            'Alexander', 'Benjamin', 'Henry', 'James', 'Thomas', 'William',
            'Harper', 'Maya', 'Nova', 'Rowan', 'Stella', 'Wren',
            'Asher', 'Ezra', 'Kai', 'Leo', 'Oliver', 'Silas',
            'Harlow', 'Margot', 'Ramona', 'Sloane', 'Tess', 'Zora',
            'Axel', 'Cruz', 'Dax', 'Felix', 'Jude', 'Nico',
            'Sarah', 'John', 'Karen', 'Keith', 'Rachel', 'David', 'Laura', 'Mark', 'Jennifer', 'Paul', 'Megan',
            'Brian', 'Lisa', 'Eric', 'Chloe', 'Jordan', 'Alex', 'Connor', 'Hannah', 'Dylan', 'Jessica', 'Nathan',
            'Ashley', 'Tyler', 'Casey', 'Beth', 'Wayne', 'Rita', 'Frank', 'Donna', 'Ray', 'Brenda', 'Clint', 'Paula', 'Dean',
        ]),
        surnames: Object.freeze([
            'Miller', 'Davis', 'Wilson', 'Taylor', 'Anderson', 'White',
            'Hayes', 'Brooks', 'Mercer', 'Vance', 'Reed', 'Bennett',
            'Sterling', 'Callahan', 'Cross', 'Wilder', 'Slate',
            'Gallagher', 'Burke',
        ]),
    }),
    scifi: Object.freeze({
        firstNames: Object.freeze([
            'Jax', 'Nova', 'Vex', 'Zero', 'Kael', 'Ryn',
            'Cassiopeia', 'Astraea', 'Lyra', 'Vespera', 'Callisto',
            'Orion', 'Cassian', 'Zephyr', 'Phoenix',
            'ARIA-7', 'UNIT-88', 'Echo-9', 'K-42', 'Syn-1',
            'Xylar', "Q'ron", 'Zaelen', 'Vaelis',
            'Tamara', 'Marcus', 'Nadia', 'Derek', 'Rebecca', 'Grant', 'Elena', 'Boris', 'Sarah', 'Victor',
            'Astrid', 'Soren', 'Linnea', 'Aris', 'Naomi', 'Hiroshi', 'Sonya', 'Anton', 'Petrov',
        ]),
        surnames: Object.freeze([
            'Vance', 'Chen', 'Kowalski', 'Takahashi', 'Mercer',
            'Tyrell', 'Matrix', 'Syndicate', 'Nexus', 'Apex', 'Solano',
            'Nova Prime', 'Kepler-4', 'Aegis', 'Triton', 'Cygnus',
            'Cross', 'Stone', 'Novak', 'Sterling', 'Lindholm', 'Tanaka',
            'Vanguard', 'Sector', 'Cipher', 'Ares-3', 'Orbital-9', 'Titan Base',
        ]),
    }),
    horror: Object.freeze({
        firstNames: Object.freeze([
            'Abigail', 'Cordelia', 'Hester', 'Lenore', 'Tabitha', 'Prudence',
            'Bartholomew', 'Edmund', 'Malachi', 'Silas', 'Thaddeus', 'Zebulon',
            'Annabelle', 'Pearl', 'Sadie', 'Mercy', 'Ruth',
            'Caleb', 'Eli', 'Gideon', 'Jasper', 'Levi',
            'Amos', 'Clara', 'Jude', 'Martha', 'Orson', 'Silas',
            'Thomas', 'Samuel', 'Joseph', 'Isaac', 'Nathaniel', 'Diane', 'Gary', 'Pamela', 'Alan', 'Carol', 'Roy',
            'Lyle', 'Nancy', 'Dennis',
        ]),
        surnames: Object.freeze([
            'Blackwood', 'Crane', 'Holloway', 'Ravenscroft', 'Winter', 'Graves',
            'Carver', 'Early', 'Meeks', 'Slaughter',
            'Finch', 'Pest', 'Mallow', 'Skeleton', 'Wormwood',
            'Hale', 'Pyncheon', 'Mather', 'Sewall', 'Danforth', 'Giddings', 'Skeeter', 'Slagged', 'Coffin',
        ]),
    }),
});

/** Recent non-fantasy rolls, so rerolls do not repeat themselves. */
const recentPoolNames = [];
const RECENT_LIMIT = 20;

/**
 * Roll a character name for a genre. Fantasy (and any unknown or empty genre)
 * uses the grounded fantasy generator; other genres pick from their pools.
 * @param {string} genre
 * @param {object} [options]
 * @param {string} [options.gender] free-text gender (fantasy only)
 * @param {string} [options.race] race id or free-text species (fantasy only)
 * @param {() => number} [options.random]
 * @param {string[]} [options.recent] names to avoid; defaults to this session's recent rolls
 * @returns {string}
 */
export function pickGenreCharacterName(genre, options = {}) {
    const pool = CHARACTER_NAME_POOLS[genre];
    if (!pool) return generateFantasyName(options).name;

    const random = options.random || secureRandom;
    const recent = options.recent || recentPoolNames;
    let name = '';
    for (let attempt = 0; attempt < 15; attempt++) {
        const first = pool.firstNames[Math.min(pool.firstNames.length - 1, Math.floor(random() * pool.firstNames.length))];
        const surname = pool.surnames[Math.min(pool.surnames.length - 1, Math.floor(random() * pool.surnames.length))];
        name = `${first} ${surname}`;
        if (!recent.includes(name)) break;
    }
    recent.push(name);
    if (recent.length > RECENT_LIMIT) recent.splice(0, recent.length - RECENT_LIMIT);
    return name;
}
