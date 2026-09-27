/**
 * Grounded fantasy-name generator.
 *
 * Names come from real medieval naming traditions so a rolled character sounds
 * like someone who actually lives in the world. First names are curated;
 * surnames are built the way real people got them: family names, a father's
 * name, a home place, a trade or a nickname. Race shifts which cultures are
 * likely, and a few races use small lists of their own.
 */

/** Substrings that must never appear in a generated name (user blocklist + borrowed franchise names). */
export const BLOCKED_NAME_PARTS = Object.freeze([
    'Vane', 'Kaelen', 'Thorne', 'Valerius',
    'Gimli', 'Thorin', 'Haldir', 'Sylvanas', 'Legolas', 'Elessar', 'Aragorn', 'Galadriel', 'Drizzt', 'Frodo', 'Bilbo',
]);

/** Trades and nicknames used for "the X" bynames, shared by every culture. */
const EPITHETS = Object.freeze([
    'the Miller', 'the Smith', 'the Tanner', 'the Cooper', 'the Weaver', 'the Carter', 'the Fowler', 'the Chandler',
    'the Ferryman', 'the Brewer', 'the Salter', 'the Mason', 'the Thatcher', 'the Reeve', 'the Shepherd', 'the Tailor',
    'the Dyer', 'the Potter', 'the Farrier', 'the Glover', 'the Cartwright', 'the Netmaker',
    'the Red', 'the Black', 'the Fair', 'the Tall', 'the Short', 'the Younger', 'the Elder', 'the Lame',
    'the Bald', 'the Quiet', 'the Stammerer', 'the Deaf', 'Half-Hand', 'the Stout', 'Crookback', 'the Squint',
]);

const ENGLISH_PLACE_ROOTS = ['Ash', 'Brad', 'Coln', 'Hart', 'Hol', 'Kel', 'Lang', 'Mar', 'Oak', 'Ren', 'Stan', 'Wen', 'Whit', 'Wyk', 'Elm', 'Ald', 'Brom', 'Cold', 'Sut', 'Thurl'];
const ENGLISH_PLACE_SUFFIXES = ['by', 'ford', 'ley', 'ham', 'wick', 'stead', 'don', 'well', 'thorpe', 'cote', 'bury', 'combe', 'mere'];
const NORSE_PLACE_ROOTS = ['Aske', 'Berg', 'Dal', 'Elv', 'Fjell', 'Grav', 'Hauk', 'Kval', 'Lang', 'Mo', 'Ramn', 'Sol', 'Stav', 'Tors', 'Ulf'];
const NORSE_PLACE_SUFFIXES = ['vik', 'by', 'stad', 'holm', 'dal', 'nes', 'heim', 'fjord', 'eid'];

/**
 * Culture definitions. `surnames` entries are a string, or [masculine, feminine]
 * for traditions whose family names change with gender.
 */
const CULTURES = Object.freeze({
    english: {
        label: 'Old English / Anglo-Norman',
        feminine: [
            'Aldith', 'Alfreda', 'Agnes', 'Alice', 'Amice', 'Avice', 'Beatrix', 'Cecily', 'Edith', 'Edeva',
            'Elswith', 'Emma', 'Elfleda', 'Emmeline', 'Gunnild', 'Hawise', 'Idonea', 'Isolde', 'Joan', 'Juliana',
            'Leofrun', 'Mabel', 'Margery', 'Matilda', 'Maud', 'Milburga', 'Muriel', 'Petronilla', 'Rohesia', 'Sibyl',
            'Wymarc', 'Wulfrun', 'Ysolt', 'Godeleva', 'Christiana', 'Lettice',
        ],
        masculine: [
            'Aldred', 'Alfric', 'Aylwin', 'Baldwin', 'Bertram', 'Cuthbert', 'Dunstan', 'Eadric', 'Edric', 'Edmund',
            'Godric', 'Godwin', 'Hamo', 'Hereward', 'Hugh', 'Leofric', 'Leofwin', 'Osbert', 'Osric', 'Oswin',
            'Ralph', 'Randolph', 'Reginald', 'Roger', 'Simon', 'Swithun', 'Thurstan', 'Walter', 'Wat', 'Wulfstan',
            'Wystan', 'Geoffrey', 'Gilbert', 'Hob', 'Warin', 'Alard', 'Gideon',
        ],
        surnames: [
            'Thatcher', 'Cooper', 'Fletcher', 'Fuller', 'Ashby', 'Bradford', 'Holloway', 'Hayward', 'Marlowe', 'Fairweather',
            'Brewster', 'Chandler', 'Coker', 'Dyer', 'Hawthorn', 'Blackwood', 'Kemp', 'Lister', 'Mercer', 'Reeve',
            'Sawyer', 'Tanner', 'Tucker', 'Webb', 'Wainwright', 'Whitlock', 'Crowther', 'Gale', 'Prowse', 'Rook',
            'Stanhope', 'Wendover', 'Coldwell', 'Latchford', 'Shipley', 'Hartley', 'Merrow', 'Birkett', 'Oakes', 'Marrow',
            'Hilder', 'Sterling', 'Pollard', 'Lowe', 'Catchpole',
        ],
        patronymic: (_father, _gender, random) => `${pick(['Wat', 'Hob', 'Daw', 'Gib', 'Hud', 'Wil', 'Tom', 'Rob', 'Dick', 'Jack', 'Sim', 'Nel', 'Hick', 'Col', 'Hew'], random)}son`,
        places: random => random() < 0.6
            ? pick(ENGLISH_PLACE_ROOTS, random) + pick(ENGLISH_PLACE_SUFFIXES, random)
            : pick(['Wend', 'Hollins', 'the Marsh', 'Crossmere', 'Fennick', 'Low Barrow', 'the Mill', 'Coldharbour'], random),
    },
    norse: {
        label: 'Norse',
        feminine: [
            'Asa', 'Astrid', 'Aslaug', 'Bergljot', 'Dagny', 'Dagmar', 'Estrid', 'Freydis', 'Freya', 'Gudrun',
            'Gunnhild', 'Gyda', 'Halla', 'Helga', 'Hild', 'Inga', 'Ingrid', 'Jorunn', 'Katla', 'Ragna',
            'Ragnhild', 'Runa', 'Sigrid', 'Signy', 'Solveig', 'Thora', 'Thorgerd', 'Thurid', 'Tove', 'Unn', 'Yrsa',
        ],
        masculine: [
            'Arne', 'Asbjorn', 'Bard', 'Bjorn', 'Eirik', 'Egil', 'Einar', 'Gisli', 'Gunnar', 'Halfdan',
            'Hallbjorn', 'Harald', 'Haldor', 'Hakon', 'Hrafn', 'Ivar', 'Ketil', 'Kolbein', 'Leif', 'Olaf',
            'Orm', 'Ragnar', 'Rolf', 'Sigurd', 'Snorri', 'Stein', 'Sven', 'Thorbjorn', 'Thorgeir', 'Thorkel',
            'Toki', 'Ulf', 'Vemund',
        ],
        surnames: ['Berg', 'Dal', 'Haug', 'Lund', 'Moen', 'Rud', 'Strand', 'Vik', 'Aas', 'Holm', 'Nes', 'Bakke', 'Lie', 'Myhre', 'Tveit', 'Sande', 'Hovde', 'Fjeld'],
        patronymicWeight: 30,
        patronymic: (father, gender) => `${father.endsWith('s') ? father : `${father}s`}${gender === 'feminine' ? 'dottir' : 'son'}`,
        fatherFilter: name => !/[aeiouy]$/i.test(name),
        places: random => pick(NORSE_PLACE_ROOTS, random) + pick(NORSE_PLACE_SUFFIXES, random),
    },
    gaelic: {
        label: 'Gaelic',
        feminine: [
            'Aoife', 'Ailbhe', 'Aine', 'Bevin', 'Brighid', 'Brida', 'Caitrin', 'Clodagh', 'Derbhail', 'Deirdre',
            'Eithne', 'Emer', 'Fionnuala', 'Grainne', 'Gormlaith', 'Ide', 'Isbeal', 'Mor', 'Muirenn', 'Niamh',
            'Orlaith', 'Roisin', 'Sadhbh', 'Saoirse', 'Siobhan', 'Sorcha', 'Una', 'Mairead', 'Ealasaid', 'Beathag',
        ],
        masculine: [
            'Aed', 'Ailill', 'Alasdair', 'Art', 'Brian', 'Cathal', 'Ciaran', 'Colm', 'Conall', 'Conn',
            'Cormac', 'Diarmait', 'Domnall', 'Donnchad', 'Eachann', 'Eoghan', 'Fearghal', 'Fergus', 'Fiachra', 'Finnian',
            'Gillespie', 'Kieran', 'Lorcan', 'Muiredach', 'Niall', 'Oisin', 'Rowan', 'Ruaidri', 'Seanan', 'Tadhg', 'Tomas',
        ],
        // Clan names are built by `surname` below; the list holds the clan roots.
        surnames: [
            'Conmara', 'Floinn', 'Carthaigh', 'Néill', 'Lochlainn', 'Dubhghaill', 'Aodha', 'Ceallaigh', 'Suibhne', 'Riain',
            'Diarmada', 'Faoláin', 'Ruairí', 'Duinn', 'Domhnaill', 'Briain', 'Cathail', 'Fearghail', 'Gormáin', 'Dálaigh',
        ],
        surname: (gender, random) => gaelicClanName(pick(CULTURES.gaelic.surnames, random), gender, random),
        patronymic: (_father, gender, random) => gaelicClanName(pick(CULTURES.gaelic.surnames, random), gender, random),
        places: random => pick(['Inis Cealtra', 'Cill Dara', 'Dún Mór', 'Ard Macha', 'Gleann Dá Loch', 'Ros Cré', 'Achadh Bó', 'Cluain Eois', 'Loch Cé'], random),
    },
    welsh: {
        label: 'Welsh / Brythonic',
        feminine: [
            'Angharad', 'Annest', 'Arianwen', 'Branwen', 'Ceinwen', 'Crisiant', 'Dilys', 'Efa', 'Elen', 'Elowen',
            'Eluned', 'Enid', 'Generys', 'Gwenllian', 'Gwladys', 'Gwerful', 'Heledd', 'Lleucu', 'Mali', 'Morfudd',
            'Myfanwy', 'Nest', 'Nia', 'Rhiannon', 'Siwan', 'Tangwystl', 'Tanwen', 'Tegwen',
        ],
        masculine: [
            'Anarawd', 'Bleddyn', 'Cadell', 'Cadwgan', 'Cynan', 'Dafydd', 'Dai', 'Einion', 'Emrys', 'Gethin',
            'Goronwy', 'Gruffudd', 'Gwilym', 'Hywel', 'Iestyn', 'Ieuan', 'Idris', 'Iorwerth', 'Llywelyn', 'Madog',
            'Maredudd', 'Meurig', 'Owain', 'Rhodri', 'Rhys', 'Tudur', 'Trahaearn',
        ],
        surnames: ['Vaughan', 'Gwyn', 'Llwyd', 'Gough', 'Moyle', 'Powell', 'Price', 'Pugh', 'Bevan', 'Parry', 'Prydderch', 'Wyn', 'Probert', 'Bowen', 'Prosser', 'Craddock'],
        patronymicWeight: 25,
        patronymic: (father, gender) => (gender === 'feminine' ? `verch ${father}` : `${/^[AEIOUY]/.test(father) ? 'ab' : 'ap'} ${father}`),
        places: random => pick(['Caerwys', 'Llanfair', 'Nant Conwy', 'Penmon', 'Dinefwr', 'Tregaron', 'Aberffraw', 'Cydweli', 'Ystrad Fflur'], random),
    },
    frankish: {
        label: 'Frankish / Old French',
        feminine: [
            'Adelaide', 'Adeline', 'Aelis', 'Alienor', 'Amelot', 'Aude', 'Beatris', 'Berthe', 'Blanche', 'Clemence',
            'Ermengarde', 'Genevieve', 'Gisla', 'Guiborc', 'Heloise', 'Hersende', 'Isabeau', 'Jehanne', 'Mahaut', 'Marguerite',
            'Oriabel', 'Perrine', 'Richilde', 'Sibille', 'Ysabel', 'Alix',
        ],
        masculine: [
            'Aimery', 'Anseau', 'Arnoul', 'Aubert', 'Baudouin', 'Bertrand', 'Enguerrand', 'Evrard', 'Foulques', 'Gautier',
            'Geoffroi', 'Gerard', 'Gervais', 'Gilles', 'Guérin', 'Guy', 'Hugues', 'Jehan', 'Lambert', 'Mathieu',
            'Odo', 'Perceval', 'Perrin', 'Raoul', 'Renaud', 'Robert', 'Thibaut', 'Yves', 'Anselme', 'Garnier',
        ],
        surnames: [
            'Boucher', 'Charpentier', 'Lefèvre', 'Lenoir', 'Leroux', 'Petit', 'Faucher', 'Marchand', 'Mercier', 'Tissier',
            'Vasseur', 'Barbier', 'Bonhomme', 'Courtois', 'Bonnet', 'Brun', 'Giraud', 'Morel', 'Rousseau', 'Pasquier',
            'Duval', 'Dubois', 'Dumont', 'Chastel', 'Moreau', 'Vautrin', 'Fournier',
        ],
        patronymic: father => father,
        of: 'de',
        places: random => pick(['Montreuil', 'Beaumont', 'Aubigny', 'Coucy', 'Brienne', 'Joinville', 'Vermand', 'Châtillon', 'Ferrières', 'Mauléon', 'Rochefort', 'Valmont', 'Ivry'], random),
    },
    occitan: {
        label: 'Occitan / Iberian',
        feminine: [
            'Alazais', 'Azalais', 'Beatritz', 'Belissenda', 'Brunissenda', 'Esclarmonda', 'Ermessenda', 'Fabrissa', 'Garsenda', 'Guillelma',
            'Mabilia', 'Navarra', 'Orbria', 'Raimunda', 'Sancha', 'Tiborc', 'Urraca', 'Elvira', 'Jimena', 'Mencia',
            'Oria', 'Teresa', 'Leonor', 'Mayor', 'Aldonza', 'Inés', 'Estefania',
        ],
        masculine: [
            'Arnaut', 'Bernat', 'Bertran', 'Guilhem', 'Jaufre', 'Peire', 'Raimon', 'Ramon', 'Uc', 'Sicart',
            'Folquet', 'Aimeric', 'Gaston', 'Sancho', 'Rodrigo', 'Fernan', 'Gonzalo', 'Nuño', 'Pelayo', 'Diego',
            'Garcia', 'Ordoño', 'Vermudo', 'Íñigo', 'Lope', 'Martin', 'Alvar', 'Tello', 'Munio',
        ],
        surnames: [
            'Sánchez', 'Fernández', 'Rodríguez', 'González', 'Garcés', 'Íñiguez', 'Álvarez', 'López', 'Muñoz', 'Peláez',
            'Faure', 'Fabre', 'Molinier', 'Castel', 'Ferrand', 'Bonnafous', 'Carbonel', 'Mascaron', 'Ribas', 'Serra',
            'Vidal', 'Pujol', 'Roca', 'Marti',
        ],
        patronymic: (_father, _gender, random) => pick(['Sánchez', 'Rodríguez', 'Fernández', 'González', 'Díaz', 'Garcés', 'Íñiguez', 'López', 'Muñoz', 'Peláez', 'Ordóñez', 'Téllez', 'Martínez', 'Álvarez', 'Núñez', 'Bermúdez'], random),
        of: 'de',
        places: random => pick(['Brassac', 'Foix', 'Lavaur', 'Mirepoix', 'Laurac', 'Fanjeaux', 'Vilar', 'Olmedo', 'Haro', 'Lara', 'Aranda', 'Belmonte', 'Quintana', 'Vivar', 'Oloron'], random),
    },
    italian: {
        label: 'Italian / late Latin',
        feminine: [
            'Agnesina', 'Aurelia', 'Beatrice', 'Bianca', 'Caterina', 'Chiara', 'Cornelia', 'Costanza', 'Diamante', 'Fiammetta',
            'Filippa', 'Flavia', 'Ginevra', 'Giustina', 'Isotta', 'Lapa', 'Letizia', 'Lisabetta', 'Livia', 'Lucrezia',
            'Margherita', 'Nicolosa', 'Orsola', 'Ottavia', 'Piccarda', 'Sibilla', 'Tancia', 'Tessa', 'Vanna',
        ],
        masculine: [
            'Andrea', 'Bartolo', 'Benedetto', 'Bonaccorso', 'Cassiano', 'Cecco', 'Corrado', 'Duccio', 'Filippo', 'Gherardo',
            'Guido', 'Iacopo', 'Lapo', 'Lorenzo', 'Luciano', 'Manfredi', 'Marcello', 'Matteo', 'Neri', 'Niccolò',
            'Ottaviano', 'Piero', 'Rinaldo', 'Salvestro', 'Tiberio', 'Tommaso', 'Ugolino', 'Vanni', 'Vieri',
        ],
        surnames: [
            'Ferraro', 'Sartori', 'Bartoli', 'Rossi', 'Grasso', 'Biondi', 'Bianchi', 'Baldi', 'Benci', 'Capponi',
            'Corsini', 'Del Bene', 'Guidi', 'Lanfranchi', 'Magalotti', 'Orlandi', 'Ricci', 'Tornabuoni', 'Vettori', 'Bardi',
            'Peruzzi', 'Mancini', 'Zanetti', 'Fabbri',
        ],
        patronymic: father => `di ${father}`,
        of: 'da',
        places: random => pick(['Fiesole', 'Lucca', 'Prato', 'Montalcino', 'Cortona', 'Gubbio', 'Todi', 'Spoleto', 'Volterra', 'Arezzo', 'Imola', 'Anghiari'], random),
    },
    slavic: {
        label: 'Slavic',
        feminine: [
            'Bogna', 'Bozhena', 'Dobrava', 'Dragomira', 'Dubravka', 'Jarmila', 'Kazimira', 'Lada', 'Lubomira', 'Ludmila',
            'Milena', 'Mirka', 'Nadezhda', 'Olena', 'Predslava', 'Radka', 'Rogneda', 'Snezhana', 'Stanislava', 'Svetlana',
            'Vesna', 'Vlasta', 'Yaroslava', 'Zbyslava', 'Zdenka', 'Zlata',
        ],
        masculine: [
            'Bohdan', 'Borislav', 'Bozhidar', 'Dobromir', 'Dragan', 'Drago', 'Gorazd', 'Igor', 'Jaromir', 'Kazimir',
            'Ludomir', 'Miroslav', 'Mstislav', 'Oleg', 'Ostoja', 'Premysl', 'Radomir', 'Ratibor', 'Rostislav', 'Stanimir',
            'Svyatoslav', 'Tihomir', 'Vladislav', 'Vojtech', 'Vseslav', 'Yaropolk', 'Zbigniew', 'Zoran',
        ],
        surnames: [
            ['Bielski', 'Bielska'], ['Dubrov', 'Dubrova'], ['Grozev', 'Grozeva'], 'Kovač', 'Kowal', ['Lisowski', 'Lisowska'],
            ['Morozov', 'Morozova'], 'Novak', ['Orlov', 'Orlova'], 'Petrović', ['Radev', 'Radeva'], 'Sokol', ['Volkov', 'Volkova'],
            'Zelenko', 'Mlynar', 'Horvat', 'Kiriak', ['Voronin', 'Voronina'], ['Belov', 'Belova'], 'Karas', 'Dvorak', 'Chernik',
        ],
        patronymic: (father, gender) => `${father}${gender === 'feminine' ? 'ovna' : 'ovich'}`,
        fatherFilter: name => !/[aeiouy]$/i.test(name),
        places: random => pick(['Turov', 'Polotsk', 'Pskov', 'Vyshgorod', 'Halych', 'Pereyaslav', 'Kolomna', 'Zvenigorod', 'Belz', 'Lutsk'], random),
    },
    byzantine: {
        label: 'Byzantine Greek',
        feminine: [
            'Agathe', 'Anastaso', 'Anna', 'Chrysanthe', 'Eirene', 'Eudokia', 'Eudoxia', 'Euphemia', 'Euphrosyne', 'Helena',
            'Ianthe', 'Kale', 'Kassia', 'Maria', 'Martina', 'Photeine', 'Pulcheria', 'Sophia', 'Thekla', 'Theodora',
            'Theodote', 'Theophano', 'Xene', 'Zoe',
        ],
        masculine: [
            'Alexios', 'Andronikos', 'Bardas', 'Basileios', 'Demetrios', 'Eustathios', 'Georgios', 'Gregorios', 'Ioannes', 'Isaakios',
            'Konstantinos', 'Kosmas', 'Leo', 'Leontios', 'Manuel', 'Maurikios', 'Michael', 'Nikephoros', 'Niketas', 'Philaretos',
            'Romanos', 'Stephanos', 'Symeon', 'Theodoros', 'Theophilos', 'Theron',
        ],
        surnames: [
            ['Doukas', 'Doukaina'], ['Komnenos', 'Komnene'], ['Phokas', 'Phokaina'], ['Skleros', 'Sklerina'],
            ['Kantakouzenos', 'Kantakouzene'], ['Melissenos', 'Melissene'], ['Tornikes', 'Tornikaina'], ['Maleinos', 'Maleine'],
            ['Kamateros', 'Kamatera'], ['Choniates', 'Choniatissa'], ['Mylonas', 'Mylona'], ['Taronites', 'Taronitissa'],
            ['Batatzes', 'Batatzina'], ['Monomachos', 'Monomachina'], ['Kalligas', 'Kalliga'], ['Branas', 'Branaina'],
        ],
        places: random => pick(['Nicaea', 'Trebizond', 'Chalcedon', 'Thessalonike', 'Philadelpheia', 'Amorion', 'Kotyaion', 'Mesembria', 'Dyrrachion', 'Attaleia'], random),
    },
    persian: {
        label: 'Persian / Levantine',
        feminine: [
            'Azadeh', 'Banu', 'Dilara', 'Farangis', 'Golnaz', 'Gordiya', 'Gulnar', 'Katayun', 'Laleh', 'Mahin',
            'Manijeh', 'Mitra', 'Nasrin', 'Pari', 'Parvaneh', 'Roshanak', 'Rudabeh', 'Shahrbanu', 'Shirin', 'Soraya',
            'Tahmina', 'Yasaman', 'Zohreh', 'Layla', 'Maryam', 'Salma', 'Hind', 'Rabab',
        ],
        masculine: [
            'Ardashir', 'Arash', 'Babak', 'Bahram', 'Dariush', 'Farrokh', 'Firuz', 'Giv', 'Hormoz', 'Jamshid',
            'Kaveh', 'Khosrow', 'Mehran', 'Narses', 'Parviz', 'Rostam', 'Shapur', 'Siavash', 'Sohrab', 'Teymur',
            'Zal', 'Yusuf', 'Tariq', 'Samir', 'Rashid', 'Ilyas', 'Harith', 'Nizar',
        ],
        surnames: [
            'Kermani', 'Shirazi', 'Tabrizi', 'Isfahani', 'Hamadani', 'Nishapuri', 'Ahangar', 'Najjar', 'Haddad', 'Sabbagh',
            'Khayyat', 'Attar', 'Farahani', 'Daylami', 'Khorasani', 'Qazvini',
        ],
        patronymic: (father, gender, random) => (random() < 0.5
            ? `${father}zadeh`
            : `${gender === 'feminine' ? 'bint' : 'ibn'} ${father}`),
        places: random => pick(['Rayy', 'Merv', 'Nishapur', 'Balkh', 'Gurgan', 'Tus', 'Qazvin', 'Hamadan', 'Sarakhs'], random),
    },
});

export const FANTASY_CULTURE_IDS = Object.freeze(Object.keys(CULTURES));

const HALFLING_NAMES = Object.freeze({
    feminine: ['Mabel', 'Nell', 'Bess', 'Dot', 'Moll', 'Rosie', 'Lottie', 'Tibby', 'Hetty', 'Clem', 'Primrose', 'Marigold', 'Wenna', 'Kitty'],
    masculine: ['Tobias', 'Pip', 'Hob', 'Wat', 'Jem', 'Kit', 'Ned', 'Tam', 'Bartram', 'Cuthbert', 'Bertie', 'Rufus', 'Dickon', 'Hal'],
    surnames: ['Bramble', 'Tunn', 'Dimble', 'Hobday', 'Merriweather', 'Smallwood', 'Honeycutt', 'Applegarth', 'Furrow', 'Crumb', 'Tuck', 'Cobble', 'Wheatley', 'Barley', 'Pottle', 'Haybarn', 'Parsley', 'Burrow', 'Hedger'],
});

const GNOME_NICKNAMES = Object.freeze(['Cogs', 'Soot', 'Quill', 'Brass', 'Pinch', 'Tick', 'Wicks', 'Spark', 'Nib', 'Button', 'Lark', 'Fidget', 'Screw', 'Pips']);
const GNOME_SURNAMES = Object.freeze(['Vell', 'Tosk', 'Pim', 'Brill', 'Fenn', 'Nock', 'Tammet', 'Gribble', 'Wendle', 'Pask', 'Orrin', 'Bix']);

const TIEFLING_VIRTUES = Object.freeze([
    'Mercy', 'Patience', 'Temperance', 'Constance', 'Prudence', 'Charity', 'Faith', 'Hope', 'Honor', 'Silence',
    'Sorrow', 'Penance', 'Solace', 'Verity', 'Clemency', 'Grace', 'Fortitude', 'Justice', 'Resolve', 'Humility',
    'Lament', 'Vigil', 'Endurance', 'Discretion', 'Reverence', 'Chant', 'Creed', 'Weary', 'Temerity', 'Nowhere',
]);

const ORC_NAMES = Object.freeze({
    feminine: ['Agra', 'Baggra', 'Dura', 'Ghesh', 'Harka', 'Ishka', 'Kagra', 'Lurra', 'Marga', 'Nokha', 'Oshra', 'Rukka', 'Shel', 'Tagra', 'Urza', 'Vesh', 'Yagra', 'Zhara'],
    masculine: ['Agrash', 'Brunk', 'Dagh', 'Dursk', 'Gorm', 'Grask', 'Hurn', 'Jagh', 'Korv', 'Lugrin', 'Marsk', 'Nargol', 'Ogg', 'Ruhk', 'Shagun', 'Torg', 'Uzhak', 'Yurk'],
    clans: ['Harrak', 'Mogdur', 'Skarn', 'Uzgal', 'Borsk', 'Tagrim', 'Gorrath', 'Durzum'],
    epithets: ['One-Eye', 'Split-Lip', 'Half-Ear', 'Broken-Tooth', 'the Lame', 'the Quiet', 'the Tall', 'the Old', 'Bent-Nose', 'the Butcher'],
});

const GOLIATH_NAMES = Object.freeze({
    feminine: ['Aveth', 'Eyra', 'Galla', 'Ilka', 'Kaeth', 'Lhera', 'Nalla', 'Paava', 'Sena', 'Theyra', 'Uma', 'Varra', 'Oskra', 'Dhalla'],
    masculine: ['Barath', 'Dern', 'Egath', 'Gorun', 'Kalu', 'Kethran', 'Lothak', 'Mavek', 'Naal', 'Orun', 'Pethrik', 'Tauk', 'Uthal', 'Vagun', 'Zarn'],
    clans: ['Ohrun', 'Vaskar', 'Theluk', 'Maggun', 'Kethra', 'Dunnak', 'Hollgar'],
    nicknames: ['Long-Walk', 'Keeps-Watch', 'Twice-Fallen', 'Stone-Counter', 'Goes-Alone', 'Last-Up', 'Cold-Hands', 'Three-Winters', 'Never-Lost', 'Loud-Laugh'],
});

const DRAGONBORN_NAMES = Object.freeze({
    feminine: ['Dhessa', 'Irrin', 'Kethra', 'Marzha', 'Sorra', 'Vhessi', 'Ashkha', 'Nyrrah', 'Therzi', 'Oskha', 'Zarrin', 'Hessa'],
    masculine: ['Arzhen', 'Dharok', 'Gharen', 'Khessin', 'Morvash', 'Nadrek', 'Rhoskar', 'Sethrin', 'Tarhun', 'Vorrash', 'Zhenn', 'Bharash'],
    clans: ['Dhoraz', 'Kellarin', 'Morhask', 'Othrenn', 'Sarvek', 'Tzeshan', 'Vharrik', 'Yarjhal', 'Khemrai', 'Durrosh'],
});

const SILKBORN_NAMES = Object.freeze([
    'Thresh', 'Weft', 'Warp', 'Tatter', 'Skein', 'Knot', 'Bight', 'Hitch', 'Dew', 'Latch', 'Snare', 'Cinch',
    'Tangle', 'Reel', 'Selvage', 'Twill', 'Heddle', 'Bobbin', 'Shuttle', 'Nine-Knots', 'Seventh-Strand',
    'Loom-Left', 'Hollow-Thread', 'Frayed',
]);

const DEFAULT_FORM_WEIGHTS = Object.freeze({ surname: 60, patronymic: 12, place: 10, epithet: 10, single: 8 });

/** Race profiles: which cultures a race leans toward, and any race-specific naming. */
const RACE_PROFILES = Object.freeze({
    human: {},
    dwarf: { leans: ['norse', 'english', 'slavic'] },
    elf: { leans: ['welsh', 'gaelic', 'occitan'] },
    halfelf: { leans: ['welsh', 'gaelic', 'occitan'], leanShare: 0.4 },
    halfling: { leans: ['english'], leanShare: 0.85, extraNames: HALFLING_NAMES },
    gnome: { leans: ['frankish', 'italian'], gnome: true },
    aasimar: { leans: ['byzantine', 'italian', 'persian'] },
    vampire: { leans: ['slavic', 'byzantine', 'frankish'], formWeights: { surname: 50, patronymic: 12, place: 25, epithet: 5, single: 8 } },
    tiefling: { special: 0.5, build: buildTieflingName },
    orc: { special: 0.7, build: buildOrcName },
    halforc: { special: 0.35, build: buildOrcName },
    goliath: { special: 0.7, build: buildGoliathName },
    dragonborn: { special: 1, build: buildDragonbornName },
    silkborn: { special: 0.5, build: buildSilkbornName },
});

const RACE_PATTERNS = [
    ['halfelf', /half[-\s]?elf/],
    ['halforc', /half[-\s]?orc/],
    ['dragonborn', /dragonborn|draconic/],
    ['tiefling', /tiefling/],
    ['aasimar', /aasimar/],
    ['dwarf', /dwar(f|v)|duergar/],
    ['halfling', /halfling|hobbit/],
    ['elf', /\b(elf|elves|elven|elvish|drow|eladrin)\b/],
    ['gnome', /gnom/],
    ['goliath', /goliath/],
    ['orc', /\borc(s|ish)?\b/],
    ['vampire', /vampir|dhampir/],
    ['silkborn', /silkborn/],
];

/** @returns {number} a value in [0, 1) */
export function secureRandom() {
    if (globalThis.crypto?.getRandomValues) {
        const values = new Uint32Array(1);
        globalThis.crypto.getRandomValues(values);
        return values[0] / 0x100000000;
    }
    return Math.random();
}

function pick(list, random) {
    return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

function pickWeighted(weights, random) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = random() * total;
    for (const [key, w] of entries) {
        roll -= w;
        if (roll < 0) return key;
    }
    return entries[entries.length - 1][0];
}

const LENITABLE = /^[BCDFGMPST](?!h)/;

/** Irish clan name: Mac/Ó for men, Nic/Ní (with lenition) for women. */
function gaelicClanName(root, gender, random) {
    const isMac = random() < 0.5;
    if (gender !== 'feminine') return `${isMac ? 'Mac' : 'Ó'} ${root}`;
    const lenited = LENITABLE.test(root) ? `${root[0]}h${root.slice(1)}` : root;
    return `${isMac ? 'Nic' : 'Ní'} ${lenited}`;
}

/**
 * Read a free-text gender field.
 * @param {string} [text]
 * @returns {'feminine'|'masculine'|null}
 */
export function parseGenderHint(text) {
    const value = String(text || '').toLowerCase();
    const feminine = /\b(female|woman|women|girl|she|her|fem|feminine|lady|f)\b/.test(value);
    const masculine = /\b(male|man|men|boy|he|him|masc|masculine|m)\b/.test(value);
    if (feminine === masculine) return null;
    return feminine ? 'feminine' : 'masculine';
}

/**
 * Map a race id or free-text species to a race profile key.
 * @param {string} [text]
 * @returns {string}
 */
export function resolveRaceProfile(text) {
    const value = String(text || '').toLowerCase().trim();
    if (!value) return 'human';
    if (RACE_PROFILES[value]) return value;
    const match = RACE_PATTERNS.find(([, pattern]) => pattern.test(value));
    return match ? match[0] : 'human';
}

const VOWEL_SHIFT = { a: 'e', e: 'i', i: 'e', o: 'a', u: 'o' };
const VOWELS = /[aeiouyáéíóúàèìòù]/i;

/** Lightly alter a real name (one vowel) so a few rolls are invented but still sound native. */
function alterName(name, random) {
    const spots = [];
    for (let i = 1; i < name.length; i++) {
        const ch = name[i];
        if (!VOWEL_SHIFT[ch]) continue;
        const prev = name[i - 1];
        const next = name[i + 1] || '';
        if (VOWELS.test(prev) || VOWELS.test(next) || /[\s'-]/.test(prev)) continue;
        spots.push(i);
    }
    if (!spots.length) return name;
    const i = pick(spots, random);
    return name.slice(0, i) + VOWEL_SHIFT[name[i]] + name.slice(i + 1);
}

function genderedEntry(entry, gender) {
    if (!Array.isArray(entry)) return entry;
    return gender === 'feminine' ? entry[1] : entry[0];
}

function withPreposition(prefix, place) {
    if ((prefix === 'de' || prefix === 'da') && /^[AEIOUÁÉÍÓÚ]/.test(place)) return `d'${place}`;
    return `${prefix} ${place}`;
}

function chooseCulture(profile, random) {
    const leans = profile.leans || [];
    if (!leans.length) return pick(FANTASY_CULTURE_IDS, random);
    const share = profile.leanShare ?? 0.7;
    if (random() < share) return pick(leans, random);
    const others = FANTASY_CULTURE_IDS.filter(id => !leans.includes(id));
    return pick(others, random);
}

function cultureSurname(culture, gender, random) {
    if (culture.surname) return culture.surname(gender, random);
    return genderedEntry(pick(culture.surnames, random), gender);
}

function buildCultureName({ gender, random, profile }) {
    const cultureId = chooseCulture(profile, random);
    const culture = CULTURES[cultureId];
    let first;
    const extra = profile.extraNames;
    if (extra && random() < 0.5) first = pick(extra[gender], random);
    else first = pick(culture[gender], random);
    let invented = false;
    if (random() < 0.1) {
        const altered = alterName(first, random);
        invented = altered !== first;
        first = altered;
    }

    // Roughly one roll in ten mixes in a family name from another culture.
    const surnameCultureId = random() < 0.1
        ? pick(FANTASY_CULTURE_IDS.filter(id => id !== cultureId), random)
        : cultureId;
    const sc = CULTURES[surnameCultureId];
    const weights = { ...(profile.formWeights || DEFAULT_FORM_WEIGHTS) };
    if (sc.patronymicWeight) weights.patronymic = sc.patronymicWeight;
    if (!sc.patronymic) weights.patronymic = 0;
    const form = pickWeighted(weights, random);

    let name;
    if (form === 'patronymic') {
        const fathers = sc.masculine.filter(sc.fatherFilter || (() => true));
        name = `${first} ${sc.patronymic(pick(fathers, random), gender, random)}`;
    } else if (form === 'place') {
        name = `${first} ${withPreposition(sc.of || 'of', sc.places(random))}`;
    } else if (form === 'epithet') {
        name = `${first} ${pick(EPITHETS, random)}`;
    } else if (form === 'single') {
        name = first;
    } else {
        let surname = cultureSurname(sc, gender, random);
        if (extra && random() < 0.5) surname = pick(extra.surnames, random);
        if (profile.gnome && random() < 0.5) surname = pick(GNOME_SURNAMES, random);
        name = profile.gnome && random() < 0.4
            ? `${first} "${pick(GNOME_NICKNAMES, random)}" ${surname}`
            : `${first} ${surname}`;
    }
    return { name, culture: cultureId, surnameCulture: surnameCultureId, form, invented };
}

function buildTieflingName({ gender, random }) {
    const human = buildCultureName({ gender, random, profile: RACE_PROFILES.human });
    const virtue = pick(TIEFLING_VIRTUES, random);
    // Virtue names often stand alone; otherwise they keep the family's surname.
    const rest = human.name.split(' ').slice(1).join(' ');
    const name = rest && random() < 0.7 ? `${virtue} ${rest}` : virtue;
    return { ...human, name, culture: 'tiefling', form: rest && name !== virtue ? human.form : 'single', invented: false };
}

function buildOrcName({ gender, random }) {
    const first = pick(ORC_NAMES[gender], random);
    const form = pickWeighted({ single: 30, epithet: 25, patronymic: 25, clan: 20 }, random);
    let name = first;
    if (form === 'epithet') name = `${first} ${pick(ORC_NAMES.epithets, random)}`;
    else if (form === 'patronymic') name = `${first}, ${gender === 'feminine' ? 'daughter' : 'son'} of ${pick(ORC_NAMES.masculine.filter(n => n !== first), random)}`;
    else if (form === 'clan') name = `${first} of the ${pick(ORC_NAMES.clans, random)}`;
    return { name, culture: 'orc', form, invented: false };
}

function buildGoliathName({ gender, random }) {
    const first = pick(GOLIATH_NAMES[gender], random);
    const form = pickWeighted({ single: 30, nickname: 35, clan: 20, patronymic: 15 }, random);
    let name = first;
    if (form === 'nickname') name = `${first} ${pick(GOLIATH_NAMES.nicknames, random)}`;
    else if (form === 'clan') name = `${first} of the ${pick(GOLIATH_NAMES.clans, random)}`;
    else if (form === 'patronymic') name = `${first}, ${gender === 'feminine' ? 'daughter' : 'son'} of ${pick(GOLIATH_NAMES.masculine.filter(n => n !== first), random)}`;
    return { name, culture: 'goliath', form, invented: false };
}

function buildDragonbornName({ gender, random }) {
    const first = pick(DRAGONBORN_NAMES[gender], random);
    const clan = pick(DRAGONBORN_NAMES.clans, random);
    const form = pickWeighted({ clan: 60, single: 25, clanOf: 15 }, random);
    let name = `${clan} ${first}`;
    if (form === 'single') name = first;
    else if (form === 'clanOf') name = `${first} of clan ${clan}`;
    return { name, culture: 'dragonborn', form, invented: false };
}

function buildSilkbornName({ random }) {
    return { name: pick(SILKBORN_NAMES, random), culture: 'silkborn', form: 'single', invented: false };
}

function isBlocked(name) {
    return BLOCKED_NAME_PARTS.some(part => name.includes(part));
}

/** Names rolled recently in this session; rerolls avoid them. */
const recentNames = [];
const RECENT_LIMIT = 20;

/**
 * Roll one grounded fantasy name.
 * @param {object} [options]
 * @param {string} [options.gender] free-text gender; feminine/masculine names follow it, anything else rolls either
 * @param {string} [options.race] race id or free-text species
 * @param {() => number} [options.random]
 * @param {string[]} [options.recent] names to avoid; defaults to this session's recent rolls
 * @returns {{ name: string, culture: string, form: string, gender: 'feminine'|'masculine', race: string, invented: boolean }}
 */
export function generateFantasyName(options = {}) {
    const random = options.random || secureRandom;
    const recent = options.recent || recentNames;
    const race = resolveRaceProfile(options.race);
    const profile = RACE_PROFILES[race];
    const wantedGender = parseGenderHint(options.gender);

    let result;
    for (let attempt = 0; attempt < 15; attempt++) {
        const gender = wantedGender || (random() < 0.5 ? 'feminine' : 'masculine');
        const build = profile.build && random() < profile.special ? profile.build : buildCultureName;
        result = { ...build({ gender, random, profile }), gender, race };
        if (!isBlocked(result.name) && !recent.includes(result.name)) break;
    }
    recent.push(result.name);
    if (recent.length > RECENT_LIMIT) recent.splice(0, recent.length - RECENT_LIMIT);
    return result;
}

/** All name data, for tests and tooling. */
export const FANTASY_NAME_DATA = Object.freeze({
    cultures: CULTURES,
    epithets: EPITHETS,
    halfling: HALFLING_NAMES,
    gnomeNicknames: GNOME_NICKNAMES,
    gnomeSurnames: GNOME_SURNAMES,
    tieflingVirtues: TIEFLING_VIRTUES,
    orc: ORC_NAMES,
    goliath: GOLIATH_NAMES,
    dragonborn: DRAGONBORN_NAMES,
    silkborn: SILKBORN_NAMES,
});
