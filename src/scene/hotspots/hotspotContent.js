const HOTSPOT_DEFAULTS = Object.freeze({
  radius: 5,
  iconHeight: 4,
  glowStrength: 1.2,
  prompt: 'E drücken, um mehr zu erfahren'
});

const HOTSPOT_TEXTS = Object.freeze({
  'tempelkl-altar': {
    title: 'Südliche Priesterstufen',
    description:
      'Die kleinere Stufenpyramide diente den Schreibern und Auguren als Ruhepunkt, bevor sie Botschaften und Opfergaben in die inneren Heiligtümer trugen.'
  },
  'tempelgr-altar': {
    title: 'Doppeltempel der Sonne und des Regens',
    description:
      'Der Monumentalbau vereint die Kulte von Huitzilopochtli und Tlaloc. Prozessionen umrunden ihn im Uhrzeigersinn, während Rauchfahnen den Himmel anrufen.'
  },
  'kirche-altar': {
    title: 'Haus der Bittenden',
    description:
      'Der kirchenartige Audienzsaal entstand während der Kontaktzeit. Händler und Bittsteller rezitieren hier Gelübde, die mit Federn und Gold an die Wände geheftet werden.'
  },
  'statue-altar': {
    title: 'Tor der Ahnen',
    description:
      'Die beiden Kolosse markieren den Zugang zur Plaza. Wer sie passiert, legt kleine Jadesteine oder Maiskolben nieder, um die wachsamen Geister gnädig zu stimmen.'
  },
  'feuerschale-altar': {
    title: 'Schale des Ewigen Feuers',
    description:
      'Dieses Opferfeuer brennt seit der Weihe der Stadt. Die Flamme wird nur bei Sonnenfinsternissen gelöscht und entzündet dann das gesamte Beleuchtungsnetz neu.'
  }
});

export function getHotspotDefinition(id) {
  if (!id) return null;
  const definition = HOTSPOT_TEXTS[id];
  if (!definition) return null;
  return {
    ...HOTSPOT_DEFAULTS,
    ...definition
  };
}

export { HOTSPOT_DEFAULTS, HOTSPOT_TEXTS };
