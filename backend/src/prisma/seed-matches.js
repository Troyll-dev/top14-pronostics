/**
 * Import du calendrier complet Top 14 2026-2027
 * Source : allrugby.com / LNR officiel
 * Exécuter : node src/prisma/seed-matches.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── Équipes ──────────────────────────────────────────────────────────────────
const TEAMS = [
  { name: 'Stade Toulousain',        shortName: 'TLS',  city: 'Toulouse' },
  { name: 'Union Bordeaux-Bègles',   shortName: 'UBB',  city: 'Bordeaux' },
  { name: 'Stade Rochelais',         shortName: 'SR',   city: 'La Rochelle' },
  { name: 'RC Toulon',               shortName: 'RCT',  city: 'Toulon' },
  { name: 'LOU Rugby',               shortName: 'LOU',  city: 'Lyon' },
  { name: 'ASM Clermont',            shortName: 'ASM',  city: 'Clermont-Ferrand' },
  { name: 'Stade Français Paris',    shortName: 'SFP',  city: 'Paris' },
  { name: 'Racing 92',               shortName: 'R92',  city: 'Paris' },
  { name: 'Castres Olympique',       shortName: 'CAO',  city: 'Castres' },
  { name: 'Aviron Bayonnais',        shortName: 'AB',   city: 'Bayonne' },
  { name: 'Section Paloise',         shortName: 'PAU',  city: 'Pau' },
  { name: 'Montpellier HR',          shortName: 'MHR',  city: 'Montpellier' },
  { name: 'USA Perpignan',           shortName: 'USAP', city: 'Perpignan' },
  { name: 'RC Vannes',               shortName: 'RCV',  city: 'Vannes' },
];

// Clé courte utilisée dans le calendrier → shortName en base
const ALIAS = {
  'Toulouse':    'TLS',
  'Bordeaux':    'UBB',
  'La Rochelle': 'SR',
  'Toulon':      'RCT',
  'Lyon':        'LOU',
  'Clermont':    'ASM',
  'Paris':       'SFP',
  'Racing 92':   'R92',
  'Castres':     'CAO',
  'Bayonne':     'AB',
  'Pau':         'PAU',
  'Montpellier': 'MHR',
  'Perpignan':   'USAP',
  'Vannes':      'RCV',
};

// ─── Calendrier (26 journées × 7 matchs) ─────────────────────────────────────
// Format : [domicile, extérieur]   — heure par défaut : sam 15h00
// Les dates de week-end sont celles des matchs aller (allrugby.com)
const SCHEDULE = [
  // J1 — 5-6 sept 2026 (résultats connus)
  { round: 1, date: '2026-09-05T15:00:00', home: 'Bayonne',     away: 'Toulon',      homeScore: 27, awayScore: 26 },
  { round: 1, date: '2026-09-05T15:00:00', home: 'Castres',     away: 'Vannes',      homeScore: 29, awayScore: 20 },
  { round: 1, date: '2026-09-05T15:00:00', home: 'Lyon',        away: 'Clermont',    homeScore: 40, awayScore: 36 },
  { round: 1, date: '2026-09-05T15:00:00', home: 'Montpellier', away: 'Pau',         homeScore: 19, awayScore: 27 },
  { round: 1, date: '2026-09-05T15:00:00', home: 'Paris',       away: 'Perpignan',   homeScore: 28, awayScore: 26 },
  { round: 1, date: '2026-09-05T15:00:00', home: 'Bordeaux',    away: 'Racing 92',   homeScore: 64, awayScore:  5 },
  { round: 1, date: '2026-09-06T21:05:00', home: 'La Rochelle', away: 'Toulouse',    homeScore: null, awayScore: null },

  // J2 — 12-13 sept 2026
  { round: 2, date: '2026-09-12T15:00:00', home: 'Clermont',    away: 'Paris'       },
  { round: 2, date: '2026-09-12T15:00:00', home: 'Pau',         away: 'Bayonne'     },
  { round: 2, date: '2026-09-12T15:00:00', home: 'Perpignan',   away: 'Castres'     },
  { round: 2, date: '2026-09-12T15:00:00', home: 'Racing 92',   away: 'Lyon'        },
  { round: 2, date: '2026-09-12T15:00:00', home: 'Vannes',      away: 'Montpellier' },
  { round: 2, date: '2026-09-12T17:45:00', home: 'Toulon',      away: 'La Rochelle' },
  { round: 2, date: '2026-09-13T15:00:00', home: 'Toulouse',    away: 'Bordeaux'    },

  // J3 — 19-20 sept 2026
  { round: 3, date: '2026-09-19T15:00:00', home: 'Castres',     away: 'Toulon'      },
  { round: 3, date: '2026-09-19T15:00:00', home: 'Bayonne',     away: 'Clermont'    },
  { round: 3, date: '2026-09-19T15:00:00', home: 'La Rochelle', away: 'Racing 92'   },
  { round: 3, date: '2026-09-19T15:00:00', home: 'Lyon',        away: 'Pau'         },
  { round: 3, date: '2026-09-19T15:00:00', home: 'Montpellier', away: 'Perpignan'   },
  { round: 3, date: '2026-09-19T17:45:00', home: 'Vannes',      away: 'Toulouse'    },
  { round: 3, date: '2026-09-20T15:00:00', home: 'Bordeaux',    away: 'Paris'       },

  // J4 — 26-27 sept 2026
  { round: 4, date: '2026-09-26T15:00:00', home: 'Perpignan',   away: 'Bordeaux'    },
  { round: 4, date: '2026-09-26T15:00:00', home: 'Clermont',    away: 'Castres'     },
  { round: 4, date: '2026-09-26T15:00:00', home: 'Paris',       away: 'Lyon'        },
  { round: 4, date: '2026-09-26T15:00:00', home: 'Racing 92',   away: 'Bayonne'     },
  { round: 4, date: '2026-09-26T15:00:00', home: 'Toulon',      away: 'Vannes'      },
  { round: 4, date: '2026-09-26T17:45:00', home: 'Pau',         away: 'La Rochelle' },
  { round: 4, date: '2026-09-27T15:00:00', home: 'Toulouse',    away: 'Montpellier' },

  // J5 — 3-4 oct 2026
  { round: 5, date: '2026-10-03T15:00:00', home: 'Bordeaux',    away: 'Lyon'        },
  { round: 5, date: '2026-10-03T15:00:00', home: 'Bayonne',     away: 'Paris'       },
  { round: 5, date: '2026-10-03T15:00:00', home: 'La Rochelle', away: 'Clermont'    },
  { round: 5, date: '2026-10-03T15:00:00', home: 'Racing 92',   away: 'Perpignan'   },
  { round: 5, date: '2026-10-03T15:00:00', home: 'Vannes',      away: 'Pau'         },
  { round: 5, date: '2026-10-03T17:45:00', home: 'Castres',     away: 'Toulouse'    },
  { round: 5, date: '2026-10-04T15:00:00', home: 'Montpellier', away: 'Toulon'      },

  // J6 — 10 oct 2026 (trêve européenne → 1 seul week-end)
  { round: 6, date: '2026-10-10T15:00:00', home: 'Clermont',    away: 'Bordeaux'    },
  { round: 6, date: '2026-10-10T15:00:00', home: 'Lyon',        away: 'La Rochelle' },
  { round: 6, date: '2026-10-10T15:00:00', home: 'Paris',       away: 'Montpellier' },
  { round: 6, date: '2026-10-10T15:00:00', home: 'Pau',         away: 'Castres'     },
  { round: 6, date: '2026-10-10T15:00:00', home: 'Perpignan',   away: 'Vannes'      },
  { round: 6, date: '2026-10-10T17:45:00', home: 'Toulon',      away: 'Racing 92'   },
  { round: 6, date: '2026-10-10T20:45:00', home: 'Toulouse',    away: 'Bayonne'     },

  // J7 — 24-25 oct 2026
  { round: 7, date: '2026-10-24T15:00:00', home: 'Bayonne',     away: 'Lyon'        },
  { round: 7, date: '2026-10-24T15:00:00', home: 'Castres',     away: 'Paris'       },
  { round: 7, date: '2026-10-24T15:00:00', home: 'La Rochelle', away: 'Bordeaux'    },
  { round: 7, date: '2026-10-24T15:00:00', home: 'Racing 92',   away: 'Montpellier' },
  { round: 7, date: '2026-10-24T17:45:00', home: 'Toulon',      away: 'Pau'         },
  { round: 7, date: '2026-10-24T20:45:00', home: 'Toulouse',    away: 'Perpignan'   },
  { round: 7, date: '2026-10-25T15:00:00', home: 'Vannes',      away: 'Clermont'    },

  // J8 — 31 oct - 1 nov 2026
  { round: 8, date: '2026-10-31T15:00:00', home: 'Bordeaux',    away: 'Bayonne'     },
  { round: 8, date: '2026-10-31T15:00:00', home: 'Clermont',    away: 'Racing 92'   },
  { round: 8, date: '2026-10-31T15:00:00', home: 'Lyon',        away: 'Vannes'      },
  { round: 8, date: '2026-10-31T15:00:00', home: 'Montpellier', away: 'Castres'     },
  { round: 8, date: '2026-10-31T17:45:00', home: 'Paris',       away: 'La Rochelle' },
  { round: 8, date: '2026-10-31T17:45:00', home: 'Pau',         away: 'Toulouse'    },
  { round: 8, date: '2026-11-01T15:00:00', home: 'Perpignan',   away: 'Toulon'      },

  // J9 — 7-8 nov 2026
  { round: 9, date: '2026-11-07T15:00:00', home: 'Castres',     away: 'Racing 92'   },
  { round: 9, date: '2026-11-07T15:00:00', home: 'La Rochelle', away: 'Bayonne'     },
  { round: 9, date: '2026-11-07T15:00:00', home: 'Montpellier', away: 'Lyon'        },
  { round: 9, date: '2026-11-07T15:00:00', home: 'Pau',         away: 'Perpignan'   },
  { round: 9, date: '2026-11-07T17:45:00', home: 'Toulon',      away: 'Paris'       },
  { round: 9, date: '2026-11-07T20:45:00', home: 'Toulouse',    away: 'Clermont'    },
  { round: 9, date: '2026-11-08T15:00:00', home: 'Vannes',      away: 'Bordeaux'    },

  // J10 — 28-29 nov 2026
  { round: 10, date: '2026-11-28T15:00:00', home: 'Bayonne',     away: 'Castres'     },
  { round: 10, date: '2026-11-28T15:00:00', home: 'Bordeaux',    away: 'Montpellier' },
  { round: 10, date: '2026-11-28T15:00:00', home: 'Clermont',    away: 'Toulon'      },
  { round: 10, date: '2026-11-28T15:00:00', home: 'La Rochelle', away: 'Perpignan'   },
  { round: 10, date: '2026-11-28T17:45:00', home: 'Lyon',        away: 'Toulouse'    },
  { round: 10, date: '2026-11-28T17:45:00', home: 'Paris',       away: 'Vannes'      },
  { round: 10, date: '2026-11-29T15:00:00', home: 'Racing 92',   away: 'Pau'         },

  // J11 — 5-6 déc 2026
  { round: 11, date: '2026-12-05T15:00:00', home: 'Castres',     away: 'Lyon'        },
  { round: 11, date: '2026-12-05T15:00:00', home: 'Montpellier', away: 'La Rochelle' },
  { round: 11, date: '2026-12-05T15:00:00', home: 'Pau',         away: 'Paris'       },
  { round: 11, date: '2026-12-05T15:00:00', home: 'Perpignan',   away: 'Clermont'    },
  { round: 11, date: '2026-12-05T17:45:00', home: 'Toulon',      away: 'Bordeaux'    },
  { round: 11, date: '2026-12-05T20:45:00', home: 'Toulouse',    away: 'Racing 92'   },
  { round: 11, date: '2026-12-06T15:00:00', home: 'Vannes',      away: 'Bayonne'     },

  // J12 — 19-20 déc 2026
  { round: 12, date: '2026-12-19T15:00:00', home: 'Bayonne',     away: 'Perpignan'   },
  { round: 12, date: '2026-12-19T15:00:00', home: 'Bordeaux',    away: 'Pau'         },
  { round: 12, date: '2026-12-19T15:00:00', home: 'Clermont',    away: 'Montpellier' },
  { round: 12, date: '2026-12-19T15:00:00', home: 'La Rochelle', away: 'Castres'     },
  { round: 12, date: '2026-12-19T17:45:00', home: 'Lyon',        away: 'Toulon'      },
  { round: 12, date: '2026-12-19T20:45:00', home: 'Paris',       away: 'Toulouse'    },
  { round: 12, date: '2026-12-20T15:00:00', home: 'Racing 92',   away: 'Vannes'      },

  // J13 — 26-27 déc 2026
  { round: 13, date: '2026-12-26T15:00:00', home: 'Castres',     away: 'Bordeaux'    },
  { round: 13, date: '2026-12-26T15:00:00', home: 'Montpellier', away: 'Bayonne'     },
  { round: 13, date: '2026-12-26T15:00:00', home: 'Pau',         away: 'Clermont'    },
  { round: 13, date: '2026-12-26T15:00:00', home: 'Perpignan',   away: 'Lyon'        },
  { round: 13, date: '2026-12-26T17:45:00', home: 'Racing 92',   away: 'Paris'       },
  { round: 13, date: '2026-12-26T20:45:00', home: 'Toulouse',    away: 'Toulon'      },
  { round: 13, date: '2026-12-27T15:00:00', home: 'Vannes',      away: 'La Rochelle' },

  // J14 — 2-3 janv 2027
  { round: 14, date: '2027-01-02T15:00:00', home: 'Bayonne',     away: 'Toulouse'    },
  { round: 14, date: '2027-01-02T15:00:00', home: 'Bordeaux',    away: 'Perpignan'   },
  { round: 14, date: '2027-01-02T15:00:00', home: 'Clermont',    away: 'Vannes'      },
  { round: 14, date: '2027-01-02T15:00:00', home: 'La Rochelle', away: 'Pau'         },
  { round: 14, date: '2027-01-02T17:45:00', home: 'Lyon',        away: 'Racing 92'   },
  { round: 14, date: '2027-01-02T17:45:00', home: 'Paris',       away: 'Castres'     },
  { round: 14, date: '2027-01-03T15:00:00', home: 'Toulon',      away: 'Montpellier' },

  // J15 — 23-24 janv 2027
  { round: 15, date: '2027-01-23T15:00:00', home: 'Vannes',      away: 'Perpignan'   },
  { round: 15, date: '2027-01-23T15:00:00', home: 'Castres',     away: 'Clermont'    },
  { round: 15, date: '2027-01-23T15:00:00', home: 'Montpellier', away: 'Paris'       },
  { round: 15, date: '2027-01-23T15:00:00', home: 'Pau',         away: 'Lyon'        },
  { round: 15, date: '2027-01-23T17:45:00', home: 'Racing 92',   away: 'Bordeaux'    },
  { round: 15, date: '2027-01-23T17:45:00', home: 'Toulon',      away: 'Bayonne'     },
  { round: 15, date: '2027-01-24T15:00:00', home: 'Toulouse',    away: 'La Rochelle' },

  // J16 — 30-31 janv 2027
  { round: 16, date: '2027-01-30T15:00:00', home: 'Bordeaux',    away: 'Vannes'      },
  { round: 16, date: '2027-01-30T15:00:00', home: 'Clermont',    away: 'Toulouse'    },
  { round: 16, date: '2027-01-30T15:00:00', home: 'La Rochelle', away: 'Toulon'      },
  { round: 16, date: '2027-01-30T15:00:00', home: 'Lyon',        away: 'Bayonne'     },
  { round: 16, date: '2027-01-30T17:45:00', home: 'Pau',         away: 'Montpellier' },
  { round: 16, date: '2027-01-30T17:45:00', home: 'Perpignan',   away: 'Paris'       },
  { round: 16, date: '2027-01-31T15:00:00', home: 'Racing 92',   away: 'Castres'     },

  // J17 — 20-21 fév 2027
  { round: 17, date: '2027-02-20T15:00:00', home: 'Bayonne',     away: 'La Rochelle' },
  { round: 17, date: '2027-02-20T15:00:00', home: 'Montpellier', away: 'Racing 92'   },
  { round: 17, date: '2027-02-20T15:00:00', home: 'Paris',       away: 'Bordeaux'    },
  { round: 17, date: '2027-02-20T15:00:00', home: 'Perpignan',   away: 'Pau'         },
  { round: 17, date: '2027-02-20T17:45:00', home: 'Toulon',      away: 'Clermont'    },
  { round: 17, date: '2027-02-20T20:45:00', home: 'Toulouse',    away: 'Lyon'        },
  { round: 17, date: '2027-02-21T15:00:00', home: 'Vannes',      away: 'Castres'     },

  // J18 — 27-28 fév 2027
  { round: 18, date: '2027-02-27T15:00:00', home: 'Bordeaux',    away: 'Toulon'      },
  { round: 18, date: '2027-02-27T15:00:00', home: 'Castres',     away: 'Perpignan'   },
  { round: 18, date: '2027-02-27T15:00:00', home: 'Clermont',    away: 'Bayonne'     },
  { round: 18, date: '2027-02-27T15:00:00', home: 'La Rochelle', away: 'Paris'       },
  { round: 18, date: '2027-02-27T17:45:00', home: 'Lyon',        away: 'Montpellier' },
  { round: 18, date: '2027-02-27T17:45:00', home: 'Pau',         away: 'Vannes'      },
  { round: 18, date: '2027-02-28T15:00:00', home: 'Racing 92',   away: 'Toulouse'    },

  // J19 — 20-21 mars 2027
  { round: 19, date: '2027-03-20T15:00:00', home: 'Bayonne',     away: 'Bordeaux'    },
  { round: 19, date: '2027-03-20T15:00:00', home: 'Castres',     away: 'La Rochelle' },
  { round: 19, date: '2027-03-20T15:00:00', home: 'Montpellier', away: 'Clermont'    },
  { round: 19, date: '2027-03-20T15:00:00', home: 'Paris',       away: 'Pau'         },
  { round: 19, date: '2027-03-20T17:45:00', home: 'Perpignan',   away: 'Racing 92'   },
  { round: 19, date: '2027-03-20T20:45:00', home: 'Toulon',      away: 'Lyon'        },
  { round: 19, date: '2027-03-21T15:00:00', home: 'Toulouse',    away: 'Vannes'      },

  // J20 — 27-28 mars 2027
  { round: 20, date: '2027-03-27T15:00:00', home: 'Bayonne',     away: 'Montpellier' },
  { round: 20, date: '2027-03-27T15:00:00', home: 'Bordeaux',    away: 'Toulouse'    },
  { round: 20, date: '2027-03-27T15:00:00', home: 'Clermont',    away: 'Pau'         },
  { round: 20, date: '2027-03-27T15:00:00', home: 'Lyon',        away: 'Castres'     },
  { round: 20, date: '2027-03-27T17:45:00', home: 'Perpignan',   away: 'La Rochelle' },
  { round: 20, date: '2027-03-27T17:45:00', home: 'Racing 92',   away: 'Toulon'      },
  { round: 20, date: '2027-03-28T15:00:00', home: 'Vannes',      away: 'Paris'       },

  // J21 — 17-18 avr 2027
  { round: 21, date: '2027-04-17T15:00:00', home: 'Castres',     away: 'Bayonne'     },
  { round: 21, date: '2027-04-17T15:00:00', home: 'La Rochelle', away: 'Vannes'      },
  { round: 21, date: '2027-04-17T15:00:00', home: 'Lyon',        away: 'Perpignan'   },
  { round: 21, date: '2027-04-17T15:00:00', home: 'Montpellier', away: 'Bordeaux'    },
  { round: 21, date: '2027-04-17T17:45:00', home: 'Paris',       away: 'Clermont'    },
  { round: 21, date: '2027-04-17T17:45:00', home: 'Pau',         away: 'Racing 92'   },
  { round: 21, date: '2027-04-18T15:00:00', home: 'Toulon',      away: 'Toulouse'    },

  // J22 — 24-25 avr 2027
  { round: 22, date: '2027-04-24T15:00:00', home: 'Bayonne',     away: 'Pau'         },
  { round: 22, date: '2027-04-24T15:00:00', home: 'Bordeaux',    away: 'La Rochelle' },
  { round: 22, date: '2027-04-24T15:00:00', home: 'Clermont',    away: 'Lyon'        },
  { round: 22, date: '2027-04-24T15:00:00', home: 'Paris',       away: 'Racing 92'   },
  { round: 22, date: '2027-04-24T17:45:00', home: 'Perpignan',   away: 'Montpellier' },
  { round: 22, date: '2027-04-24T20:45:00', home: 'Toulouse',    away: 'Castres'     },
  { round: 22, date: '2027-04-25T15:00:00', home: 'Vannes',      away: 'Toulon'      },

  // J23 — 8-9 mai 2027
  { round: 23, date: '2027-05-08T15:00:00', home: 'Bayonne',     away: 'Vannes'      },
  { round: 23, date: '2027-05-08T15:00:00', home: 'Clermont',    away: 'Perpignan'   },
  { round: 23, date: '2027-05-08T15:00:00', home: 'Lyon',        away: 'Paris'       },
  { round: 23, date: '2027-05-08T15:00:00', home: 'Montpellier', away: 'Toulouse'    },
  { round: 23, date: '2027-05-08T17:45:00', home: 'Pau',         away: 'Bordeaux'    },
  { round: 23, date: '2027-05-08T17:45:00', home: 'Racing 92',   away: 'La Rochelle' },
  { round: 23, date: '2027-05-09T15:00:00', home: 'Toulon',      away: 'Castres'     },

  // J24 — 15-16 mai 2027
  { round: 24, date: '2027-05-15T15:00:00', home: 'Bordeaux',    away: 'Clermont'    },
  { round: 24, date: '2027-05-15T15:00:00', home: 'Castres',     away: 'Montpellier' },
  { round: 24, date: '2027-05-15T15:00:00', home: 'La Rochelle', away: 'Lyon'        },
  { round: 24, date: '2027-05-15T15:00:00', home: 'Paris',       away: 'Toulon'      },
  { round: 24, date: '2027-05-15T17:45:00', home: 'Perpignan',   away: 'Bayonne'     },
  { round: 24, date: '2027-05-15T20:45:00', home: 'Toulouse',    away: 'Pau'         },
  { round: 24, date: '2027-05-16T15:00:00', home: 'Vannes',      away: 'Racing 92'   },

  // J25 — 29-30 mai 2027
  { round: 25, date: '2027-05-29T15:00:00', home: 'Bayonne',     away: 'Racing 92'   },
  { round: 25, date: '2027-05-29T15:00:00', home: 'Castres',     away: 'Pau'         },
  { round: 25, date: '2027-05-29T15:00:00', home: 'Clermont',    away: 'La Rochelle' },
  { round: 25, date: '2027-05-29T15:00:00', home: 'Lyon',        away: 'Bordeaux'    },
  { round: 25, date: '2027-05-29T17:45:00', home: 'Montpellier', away: 'Vannes'      },
  { round: 25, date: '2027-05-29T17:45:00', home: 'Toulon',      away: 'Perpignan'   },
  { round: 25, date: '2027-05-30T15:00:00', home: 'Toulouse',    away: 'Paris'       },

  // J26 — 5-6 juin 2027
  { round: 26, date: '2027-06-05T15:00:00', home: 'Bordeaux',    away: 'Castres'     },
  { round: 26, date: '2027-06-05T15:00:00', home: 'La Rochelle', away: 'Montpellier' },
  { round: 26, date: '2027-06-05T15:00:00', home: 'Paris',       away: 'Bayonne'     },
  { round: 26, date: '2027-06-05T15:00:00', home: 'Pau',         away: 'Toulon'      },
  { round: 26, date: '2027-06-05T17:45:00', home: 'Perpignan',   away: 'Toulouse'    },
  { round: 26, date: '2027-06-05T17:45:00', home: 'Racing 92',   away: 'Clermont'    },
  { round: 26, date: '2027-06-06T15:00:00', home: 'Vannes',      away: 'Lyon'        },
];

// ─── Import ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🏉 Import Top 14 2026-2027...\n');

  // 1. Mettre à jour les équipes
  console.log('📋 Mise à jour des équipes...');
  for (const team of TEAMS) {
    await prisma.team.upsert({
      where: { shortName: team.shortName },
      update: { name: team.name, city: team.city },
      create: team,
    });
  }

  // Construire la map shortName → id
  const teamsInDb = await prisma.team.findMany();
  const teamByShort = Object.fromEntries(teamsInDb.map((t) => [t.shortName, t.id]));

  console.log(`✅ ${TEAMS.length} équipes prêtes\n`);

  // 2. Supprimer les anciens matchs (repart sur une base propre)
  const deleted = await prisma.match.deleteMany({ where: { season: '2026-2027' } });
  if (deleted.count > 0) console.log(`🗑  ${deleted.count} anciens matchs supprimés`);

  // 3. Créer les matchs
  console.log('📅 Import des matchs...');
  let created = 0;
  let withResult = 0;

  for (const m of SCHEDULE) {
    const homeId = teamByShort[ALIAS[m.home]];
    const awayId = teamByShort[ALIAS[m.away]];

    if (!homeId || !awayId) {
      console.warn(`⚠️  Équipe introuvable : ${m.home} ou ${m.away}`);
      continue;
    }

    const hasResult = m.homeScore !== null && m.homeScore !== undefined
                   && m.awayScore !== null && m.awayScore !== undefined;

    await prisma.match.create({
      data: {
        round:      m.round,
        homeTeamId: homeId,
        awayTeamId: awayId,
        kickoff:    new Date(m.date),
        status:     hasResult ? 'FINISHED' : 'SCHEDULED',
        homeScore:  hasResult ? m.homeScore : null,
        awayScore:  hasResult ? m.awayScore : null,
        season:     '2026-2027',
      },
    });

    created++;
    if (hasResult) withResult++;
  }

  console.log(`✅ ${created} matchs importés (dont ${withResult} avec résultats)\n`);
  console.log('🎉 Import terminé ! Ouvrez l\'app pour commencer à pronostiquer.');
}

main()
  .catch((e) => { console.error('❌ Erreur :', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
