const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { format, startOfWeek, addDays } = require('date-fns');
const { ro } = require('date-fns/locale');

const filePath = process.argv[2];
console.log('filePath', filePath);
const outputFilePath = path.join('./tmp', path.basename(filePath, path.extname(filePath)) + '.json');
// Función para convertir el valor numérico de Excel a un formato de hora
function excelTimeToString(excelTime) {
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

// Procesar la hoja "Planilha1"
const sheet = workbook.Sheets['Programação'];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

// Procesar las filas a partir de la fila 2
let currentDay = null;
const programsByTitle = {};

for (let i = 0; i < data.length; i++) {
  const row = data[i];
  
  if (row[2] && daysOfWeek[row[2].trim()]) {
    currentDay = row[2].trim();
    continue;
  }
  if (row[2] && row[2].trim() === 'Programa') continue;
  // como hago un condicional para row[2] que ingrese si es un numero de cero o mayor, puede ser decimal
  if (!currentDay && (!((typeof row[0]) === 'number') || !((typeof row[1]) === 'number') || !row[2])) continue; // Saltar filas sin datos relevantes

  const startTime = row[0];
  const endTime = row[1];
  const program = row[2];

  const formattedDate = daysOfWeek[currentDay];
  const formattedStartTime = excelTimeToString(startTime);
  const formattedEndTime = excelTimeToString(endTime);

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