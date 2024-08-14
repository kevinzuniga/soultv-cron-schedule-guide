const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { format, startOfWeek, addDays } = require('date-fns');

const filePath = process.argv[2];
console.log('filePath', filePath);
const outputFilePath = path.join('./tmp', path.basename(filePath, path.extname(filePath)) + '.json');

// Función para convertir el valor numérico de Excel a un formato de hora
function excelTimeToString(excelTime) {
  if (excelTime === undefined || excelTime === null || isNaN(excelTime)) return null;
  
  // Asegurar que el valor 0 sea tratado como 00:00:00
  if (excelTime === 0) return '00:00:00';
  
  const time = parseFloat(excelTime);
  const totalMinutes = Math.round(time * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
}

// Obtener la fecha actual y calcular el inicio de la semana (lunes)
const today = new Date();
const startDate = startOfWeek(today, { weekStartsOn: 1 }); // 1 significa que la semana empieza el lunes

// Calcular las fechas de cada día de la semana
const daysOfWeek = {
  'SEGUNDA - FEIRA': format(startDate, 'dd/MM/yyyy'),
  'TERÇA-FEIRA': format(addDays(startDate, 1), 'dd/MM/yyyy'),
  'QUARTA-FEIRA': format(addDays(startDate, 2), 'dd/MM/yyyy'),
  'QUINTA-FEIRA': format(addDays(startDate, 3), 'dd/MM/yyyy'),
  'SEXTA-FEIRA': format(addDays(startDate, 4), 'dd/MM/yyyy'),
  'SÁBADO': format(addDays(startDate, 5), 'dd/MM/yyyy'),
  'DOMINGO': format(addDays(startDate, 6), 'dd/MM/yyyy')
};

// Cargar el archivo Excel
const workbook = xlsx.readFile(filePath);

// Procesar la hoja "Programação"
const sheet = workbook.Sheets['Programação'];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

// Procesar las filas a partir de la fila 2
let currentDay = null;
const programsByTitle = {};

for (let i = 0; i < data.length; i++) {
  const row = data[i];
  
  // Verificar si la fila contiene un día de la semana
  if (row[2] && daysOfWeek[row[2].trim()]) {
    currentDay = row[2].trim();
    continue;
  }
  
  // Saltar filas donde `row[2]` es "Programa"
  if (row[2] && row[2].trim().toUpperCase() === 'PROGRAMA') continue;

  // Verificar si las columnas relevantes tienen valores y tratar 0 como válido
  if (!currentDay || (typeof row[0] !== 'number' && row[0] !== 0) || (typeof row[1] !== 'number' && row[1] !== 0) || !row[2]) continue;

  const startTime = row[0];
  const endTime = row[1];
  const program = row[2];

  const formattedDate = daysOfWeek[currentDay];
  const formattedStartTime = excelTimeToString(startTime);
  const formattedEndTime = excelTimeToString(endTime);

  if (!formattedStartTime || !formattedEndTime) continue; // Si el tiempo no es válido, saltar la fila

  if (!programsByTitle[program]) {
    programsByTitle[program] = {};
  }
  if (!programsByTitle[program][formattedDate]) {
    programsByTitle[program][formattedDate] = [];
  }
  programsByTitle[program][formattedDate].push({
    startTime: formattedStartTime,
    stopTime: formattedEndTime
  });
}

const programsJson = Object.keys(programsByTitle).map(title => ({
  program: title,
  days: programsByTitle[title]
}));

// Guardar el JSON resultante en un archivo
fs.writeFile(outputFilePath, JSON.stringify(programsJson, null, 2), (err) => {
  if (err) throw err;
  console.log('Archivo JSON generado correctamente.');
});