// Bilingual activity groups: one word typed by a seeker ("gardener", "élagage", "trimming")
// resolves to every related trade, in French and in English.
//
// A group lists the words seekers actually type (both languages, accents optional) and the
// professions they should reach. Professions are named by their English catalogue name so the
// mapping survives id changes; anything that does not exist in the catalogue is ignored.

const GROUPS = [
  {
    terms: ['jardin', 'jardins', 'jardinage', 'jardinier', 'jardiniere', 'garden', 'gardener', 'gardening',
      'paysage', 'paysager', 'paysagiste', 'paysagement', 'amenagement paysager', 'landscape', 'landscaper',
      'landscaping', 'pelouse', 'gazon', 'tonte', 'tondre', 'lawn', 'mowing', 'mow', 'yard',
      'haie', 'hedge', 'arbre', 'arbres', 'tree', 'trees', 'elagage', 'emondage', 'abattage', 'taille',
      'trim', 'trimming', 'pruning', 'arborist', 'arboriculteur', 'plantation', 'planting', 'fleurs annuelles'],
    professions: ['Gardening', 'Landscaping', 'Lawn care', 'Tree trimming & removal'],
  },
  {
    terms: ['neige', 'deneigement', 'deneiger', 'pelletage', 'snow', 'shoveling', 'plowing', 'snowplow'],
    professions: ['Snow removal'],
  },
  {
    terms: ['piscine', 'pool', 'spa', 'hot tub'],
    professions: ['Pool maintenance'],
  },
  {
    terms: ['menage', 'nettoyage', 'nettoyer', 'entretien menager', 'femme de menage', 'clean', 'cleaner',
      'cleaning', 'housekeeping', 'maid', 'tapis', 'carpet', 'moquette', 'grand menage', 'deep cleaning'],
    professions: ['Residential cleaning', 'Commercial cleaning', 'Deep cleaning', 'Carpet cleaning',
      'Window washing', 'Post-construction cleaning'],
  },
  {
    terms: ['vitre', 'vitres', 'fenetres sales', 'window washing', 'pression', 'lavage a pression',
      'pressure washing', 'power washing', 'karcher'],
    professions: ['Window washing', 'Pressure washing'],
  },
  {
    terms: ['plomberie', 'plombier', 'plumber', 'plumbing', 'fuite', 'leak', 'drain', 'tuyau', 'tuyaux',
      'pipe', 'pipes', 'toilette', 'toilet', 'robinet', 'faucet', 'chauffe-eau', 'water heater', 'evier', 'sink'],
    professions: ['Plumbing'],
  },
  {
    terms: ['electricite', 'electricien', 'electrician', 'electrical', 'filage', 'wiring', 'panneau electrique',
      'breaker', 'disjoncteur', 'prise', 'outlet', 'luminaire', 'lighting'],
    professions: ['Electrician'],
  },
  {
    terms: ['chauffage', 'heating', 'fournaise', 'furnace', 'climatisation', 'climatiseur', 'air conditioning',
      'hvac', 'cvac', 'thermopompe', 'heat pump', 'ventilation', 'echangeur d air', 'refrigeration',
      'frigoriste', 'conduits', 'ducts', 'duct cleaning'],
    professions: ['Heating', 'Ventilation & air conditioning (HVAC)', 'Refrigeration', 'Duct & filter cleaning'],
  },
  {
    terms: ['toit', 'toiture', 'couvreur', 'roof', 'roofer', 'roofing', 'bardeau', 'bardeaux', 'shingle',
      'shingles', 'gouttiere', 'gouttieres', 'gutter', 'gutters', 'infiltration'],
    professions: ['Roofing', 'Gutter cleaning', 'Waterproofing'],
  },
  {
    terms: ['peinture', 'peintre', 'paint', 'painter', 'painting', 'gypse', 'platre', 'drywall', 'plaster',
      'plastering', 'joints'],
    professions: ['Painting (contractor)', 'Drywall & plastering'],
  },
  {
    terms: ['bricoleur', 'homme a tout faire', 'petits travaux', 'handyman', 'handywoman', 'odd jobs',
      'small jobs', 'montage de meubles', 'furniture assembly', 'ikea'],
    professions: ['Handyman (small jobs)', 'Furniture assembly'],
  },
  {
    terms: ['menuisier', 'menuiserie', 'charpentier', 'charpenterie', 'carpenter', 'carpentry', 'framing',
      'bois', 'wood', 'armoire', 'armoires', 'cabinet', 'cabinets', 'cabinetry', 'ebenisterie', 'millwork',
      'comptoir', 'countertop'],
    professions: ['Framing & carpentry', 'Cabinetry & millwork'],
  },
  {
    terms: ['terrasse', 'patio', 'deck', 'decking', 'balcon', 'balcony', 'pergola', 'gazebo', 'rampe',
      'railing', 'cloture', 'clotures', 'fence', 'fencing', 'fences'],
    professions: ['Decks & patios', 'Fence installation'],
  },
  {
    terms: ['plancher', 'planchers', 'flooring', 'floor', 'floors', 'revetement de sol', 'bois franc',
      'hardwood', 'laminate', 'flottant', 'vinyle', 'vinyl', 'ceramique', 'ceramic', 'tuile', 'tuiles',
      'tile', 'tiles', 'tiling', 'carrelage', 'coulis', 'grout'],
    professions: ['Flooring installation', 'Tiling & ceramics'],
  },
  {
    terms: ['porte', 'portes', 'door', 'doors', 'fenetre', 'fenetres', 'window', 'windows', 'moustiquaire',
      'screen', 'serrure', 'serrurier', 'locksmith', 'lock', 'cles', 'keys'],
    professions: ['Doors & windows (installation)', 'Doors & windows repair', 'Locksmith'],
  },
  {
    terms: ['maconnerie', 'macon', 'masonry', 'mason', 'brique', 'briques', 'brick', 'pierre', 'stone',
      'beton', 'concrete', 'ciment', 'cement', 'dalle', 'slab', 'coffrage', 'formwork', 'entree de garage',
      'driveway', 'pave uni', 'paving', 'asphalte', 'asphalt', 'excavation', 'creusage', 'digging',
      'fondation', 'fondations', 'foundation', 'fissure', 'crack', 'drain francais', 'french drain',
      'impermeabilisation', 'waterproofing', 'sous-sol', 'basement', 'acier', 'steel'],
    professions: ['Masonry', 'Concrete & formwork', 'Excavation', 'Foundations', 'Waterproofing',
      'Structural steel'],
  },
  {
    terms: ['isolation', 'isolant', 'insulation', 'entretoit', 'grenier', 'attic', 'urethane', 'spray foam',
      'insonorisation', 'soundproofing'],
    professions: ['Insulation'],
  },
  {
    terms: ['renovation', 'renover', 'renovate', 'remodel', 'entrepreneur general', 'general contractor',
      'contracteur', 'contractor', 'cuisine', 'kitchen', 'salle de bain', 'bathroom', 'agrandissement',
      'addition'],
    professions: ['General contractor', 'Framing & carpentry', 'Handyman (small jobs)'],
  },
  {
    terms: ['electromenager', 'electromenagers', 'appliance', 'appliances', 'frigo', 'refrigerateur',
      'fridge', 'laveuse', 'washer', 'secheuse', 'dryer', 'lave-vaisselle', 'dishwasher', 'four', 'oven',
      'poele', 'stove'],
    professions: ['Appliance repair'],
  },
  {
    terms: ['demenagement', 'demenageur', 'demenageurs', 'moving', 'mover', 'movers', 'transport',
      'camionnage', 'hauling', 'livraison', 'delivery', 'debris', 'rebuts', 'junk', 'garbage', 'disposal',
      'ramassage', 'camion', 'truck'],
    professions: ['Mover', 'Delivery', 'Junk removal', 'Light hauling'],
  },
  {
    terms: ['mecanicien', 'mecanique', 'mechanic', 'garagiste', 'garage', 'auto', 'automobile', 'voiture',
      'char', 'car', 'freins', 'brakes', 'huile', 'oil change', 'pneu', 'pneus', 'tire', 'tires',
      'carrosserie', 'auto body', 'bosse', 'dent', 'pare-brise', 'windshield', 'esthetique automobile',
      'detailing'],
    professions: ['Mechanic', 'Mobile mechanic', 'Auto body', 'Tire service', 'Windshield repair',
      'Auto detailing'],
  },
  {
    terms: ['cheveux', 'hair', 'coiffeur', 'coiffeuse', 'coiffure', 'hairdresser', 'hairstylist', 'barbier',
      'barber', 'coupe', 'haircut', 'maquillage', 'makeup', 'maquilleur', 'maquilleuse', 'ongles', 'nails',
      'manucure', 'manicure', 'pedicure', 'cils', 'lash', 'lashes', 'esthetique', 'estheticienne',
      'esthetician', 'facial', 'soins du visage', 'epilation', 'waxing'],
    professions: ['Hairdresser', 'Barber', 'Makeup artist', 'Nail technician', 'Eyelash extensions',
      'Esthetician'],
  },
  {
    terms: ['massage', 'massotherapie', 'massotherapeute', 'masseur', 'masseuse', 'massage therapist',
      'physio', 'physiotherapie', 'physiotherapeute', 'physiotherapist', 'entraineur', 'entraineuse',
      'personal trainer', 'trainer', 'coach', 'fitness', 'gym', 'musculation'],
    professions: ['Massage therapist', 'Physiotherapist', 'Personal trainer'],
  },
  {
    terms: ['infirmier', 'infirmiere', 'nurse', 'nursing', 'soins', 'care', 'soins a domicile', 'home care',
      'aide a domicile', 'preposee', 'prepose', 'care aide', 'aines', 'aine', 'elderly', 'senior', 'seniors',
      'gardienne', 'gardien d enfants', 'garde d enfants', 'babysitter', 'babysitting', 'childcare', 'nanny',
      'nutritionniste', 'nutrition', 'dieteticien', 'dietitian'],
    professions: ['Nurse', 'Care aide', 'Home care aide', 'Elderly care', 'Childcare / babysitting',
      'Dietitian-nutritionist'],
  },
  {
    terms: ['tuteur', 'tutrice', 'tutorat', 'tutor', 'tutoring', 'cours', 'lecon', 'lessons', 'lesson',
      'professeur', 'teacher', 'math', 'maths', 'mathematiques', 'francais', 'french', 'anglais', 'english',
      'langue', 'language', 'musique', 'music', 'piano', 'guitare', 'guitar', 'chant', 'singing', 'examen',
      'exam', 'sat', 'conduite', 'driving', 'permis'],
    professions: ['Academic tutor', 'Language teacher', 'Music lessons', 'Test preparation',
      'Driving instructor'],
  },
  {
    terms: ['chien', 'chiens', 'dog', 'dogs', 'chat', 'chats', 'cat', 'cats', 'animal', 'animaux', 'pet',
      'pets', 'promeneur', 'promenade', 'walker', 'walking', 'toilettage', 'toiletteur', 'toiletteuse',
      'grooming', 'groomer', 'gardiennage', 'pet sitter', 'sitter', 'dressage', 'educateur canin',
      'dog trainer', 'veterinaire', 'vet', 'veterinarian'],
    professions: ['Dog walker', 'Pet sitter', 'Pet groomer', 'Dog trainer', 'Veterinarian'],
  },
  {
    terms: ['mariage', 'wedding', 'evenement', 'evenements', 'event', 'events', 'fete', 'party', 'photographe',
      'photographer', 'photo', 'photos', 'video', 'videaste', 'videographer', 'dj', 'musicien', 'musicienne',
      'musician', 'groupe', 'band', 'traiteur', 'caterer', 'catering', 'buffet', 'fleuriste', 'florist',
      'fleurs', 'flowers', 'bouquet', 'organisateur', 'planner', 'decoration'],
    professions: ['Photographer', 'Videographer', 'DJ', 'Musician', 'Caterer', 'Event planner', 'Florist'],
  },
  {
    terms: ['comptable', 'comptabilite', 'accountant', 'accounting', 'cpa', 'tenue de livres', 'bookkeeper',
      'bookkeeping', 'impot', 'impots', 'tax', 'taxes', 'declaration', 'avocat', 'avocate', 'lawyer',
      'juridique', 'legal', 'notaire', 'notary', 'immobilier', 'courtier', 'real estate', 'broker',
      'consultant', 'consultation', 'traduction', 'traducteur', 'translation', 'translator', 'interprete'],
    professions: ['Accountant (CPA)', 'Bookkeeper', 'Tax preparation', 'Lawyer', 'Notary',
      'Real estate broker', 'Consultant', 'Translation'],
  },
  {
    terms: ['ordinateur', 'computer', 'laptop', 'portable', 'informatique', 'it support', 'tech support',
      'depannage informatique', 'telephone', 'cellulaire', 'phone', 'smartphone', 'ecran', 'screen',
      'site web', 'website', 'web', 'developpeur', 'developer', 'programmeur', 'programmer', 'application',
      'app', 'graphiste', 'graphic', 'logo', 'design', 'medias sociaux', 'social media', 'instagram',
      'marketing', 'reseau', 'wifi'],
    professions: ['Computer repair', 'IT support', 'Phone repair', 'Web developer', 'Graphic designer',
      'Social media manager'],
  },
  {
    terms: ['couture', 'couturier', 'couturiere', 'sewing', 'tailleur', 'tailor', 'retouche', 'retouches',
      'alterations', 'ourlet', 'hem', 'robe', 'dress', 'rembourrage', 'upholstery', 'divan', 'sofa',
      'chaise', 'chair', 'cordonnier', 'shoe repair', 'chaussure', 'chaussures', 'shoes', 'bottes', 'boots'],
    professions: ['Tailor / Alterations', 'Upholstery', 'Shoe repair'],
  },
];

function fold(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const MIN_PREFIX = 4;                                   // never prefix-match on 1–3 letter words

// A term hits when the whole (multi-word) term appears in the query, when it equals a query
// word, or when one is a prefix of the other and both are long enough for that to be meaningful.
function hits(term, query, words) {
  const t = fold(term);
  if (!t) return false;
  if (t.includes(' ')) return query.includes(t);
  return words.some(w => w === t
    || (w.length >= MIN_PREFIX && t.length >= MIN_PREFIX && (t.startsWith(w) || w.startsWith(t))));
}

// professions: [{ id, name_fr, name_en }] — the catalogue as stored.
// Returns the ids of every profession related to what the seeker typed, in both languages.
function resolve(input, professions) {
  const query = fold(input);
  if (query.length < 3) return [];                       // "a", "je" say nothing about a trade
  const words = query.split(' ').filter(Boolean);
  const list = Array.isArray(professions) ? professions : [];

  const wanted = new Set();                             // folded English names from matching groups
  GROUPS.forEach(g => {
    if (g.terms.some(term => hits(term, query, words))) g.professions.forEach(n => wanted.add(fold(n)));
  });

  const ids = new Set();
  list.forEach(p => {
    const fr = fold(p.name_fr), en = fold(p.name_en);
    // the catalogue name itself, in either language
    const named = [fr, en].some(n => n && (n === query
      || (query.length >= MIN_PREFIX && n.includes(query))
      || n.split(' ').some(w => hits(w, query, words))));
    if (wanted.has(en) || wanted.has(fr) || named) ids.add(Number(p.id));
  });
  return [...ids].filter(id => Number.isFinite(id));
}

module.exports = { resolve, fold, GROUPS };
