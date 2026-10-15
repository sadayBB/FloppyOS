/** Step templates for common university assignments (no AI needed). */
export const TASK_TEMPLATES: { id: string; name: string; steps: string[] }[] = [
  {
    id: 'exposicion',
    name: 'Exposición',
    steps: ['Entender el tema y lo que pide el profe', 'Investigar y juntar fuentes', 'Hacer el guion o esquema', 'Preparar las diapositivas', 'Ensayar en voz alta (cronometrar)', 'Preparar respuestas a posibles preguntas', 'Revisar equipo y archivo el día anterior'],
  },
  {
    id: 'proyecto',
    name: 'Proyecto',
    steps: ['Leer las instrucciones y la rúbrica', 'Definir alcance y entregables', 'Dividir el trabajo en fases', 'Desarrollar la primera versión', 'Probar y corregir', 'Documentar (reporte o README)', 'Revisar la rúbrica punto por punto', 'Entregar y respaldar'],
  },
  {
    id: 'examen',
    name: 'Examen',
    steps: ['Confirmar qué temas entran', 'Juntar apuntes, ejercicios y bibliografía', 'Repasar teoría tema por tema', 'Resolver ejercicios tipo examen', 'Repasar las dudas y temas débiles', 'Repaso final ligero la noche anterior'],
  },
  {
    id: 'laboratorio',
    name: 'Práctica de laboratorio',
    steps: ['Leer la práctica y el objetivo', 'Revisar herramientas y software necesarios', 'Hacer el montaje o la configuración', 'Ejecutar y registrar resultados', 'Tomar capturas o evidencias', 'Analizar resultados', 'Redactar el reporte'],
  },
  {
    id: 'ensayo',
    name: 'Ensayo o reporte',
    steps: ['Definir tema y tesis', 'Buscar y leer fuentes', 'Hacer el esquema', 'Escribir el borrador', 'Revisar argumentos y redacción', 'Formato y referencias', 'Lectura final y entrega'],
  },
  {
    id: 'ejercicios',
    name: 'Tarea de ejercicios',
    steps: ['Repasar la teoría necesaria', 'Resolver los ejercicios', 'Revisar resultados', 'Pasar en limpio y entregar'],
  },
  {
    id: 'lectura',
    name: 'Lectura',
    steps: ['Leer el texto', 'Subrayar ideas principales', 'Hacer resumen o mapa conceptual', 'Anotar dudas para la clase'],
  },
];
