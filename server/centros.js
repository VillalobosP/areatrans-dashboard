// ── Configuración de centros operativos ──────────────────────────────────────
// Para añadir un nuevo centro: añadir una entrada aquí. Sin tocar nada más.
// sheetId: ID de la Google Spreadsheet del centro (parte de la URL)
// sheets:  Nombres exactos de las pestañas en esa hoja
// objetivos: Cuotas mensuales de viajes (min = mínimo, obj = objetivo)

const CENTROS = {
  getafe: {
    id:    'getafe',
    label: 'GETAFE',
    sheetId: '1PloSwT20dFVmF2w-tseaDscnKZ_35a6H9PPgpP6xBOc',
    sheets: {
      enrutamiento: 'PRUEBA ENRUTAMIENTO AUTOMATICO GETAFE',
      calendario:   'CALENDARIO',
      gasoil:       'GASOIL',
      horas:        'HORAS TRABAJADORES GETAFE',
      plantilla:    'PLANTILLA GETAFE',
      incidencias:  'INCIDENCIAS GETAFE',
    },
    objetivos: { min: 225, obj: 250 },
  },

  illescas: {
    id:    'illescas',
    label: 'ILLESCAS',
    sheetId: '1PloSwT20dFVmF2w-tseaDscnKZ_35a6H9PPgpP6xBOc',
    sheets: {
      enrutamiento: 'PRUEBA ENRUTAMIENTO AUTOMATICO ILLESCAS',
      gasoil:       'GASOIL ILLESCAS',
      // Sin pestaña calendario — Illescas no usa KPIs de rutas
    },
    features: ['facturacion_lotes', 'gasoil'],
  },
};

module.exports = CENTROS;
