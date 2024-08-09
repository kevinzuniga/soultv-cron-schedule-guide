const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { format, addDays } = require('date-fns');

const filePath = process.argv[2];
console.log('filePath', filePath);
const outputFilePath = path.join('./tmp', path.basename(filePath, path.extname(filePath)) + '.json');

// Función para convertir el valor numérico de Excel a un formato de fecha
function excelDateToString(excelDate) {
  const jsDate = new Date((excelDate - 25569) * 86400 * 1000); // Ajuste del valor base de Excel
  const adjustedDate = addDays(jsDate, 1); // Ajustar la fecha sumando un día
  return format(adjustedDate, 'dd/MM/yyyy');
}

// Función para convertir el valor numérico de Excel a un formato de hora
function excelTimeToString(excelTime) {
  const time = parseFloat(excelTime);
  const totalMinutes = Math.round(time * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
}

// Cargar el archivo Excel
const workbook = xlsx.readFile(filePath);

// Procesar la hoja "Planilha1"
const sheet = workbook.Sheets['Planilha1'];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

// Procesar las filas a partir de la fila 3 y columna B
const programsByTitle = {};

for (let i = 2; i < data.length; i++) {
  const row = data[i];

  if (!row[0] || !row[1] || !row[2]) continue; // Saltar filas incompletas

  const [dayOfWeek, date, startTime, program, genre, classification] = row.slice(0, 6);

  const formattedDate = excelDateToString(date);
  const formattedStartTime = excelTimeToString(startTime);

  // Determinar el fin del programa
  const nextRow = data[i + 1];
  const formattedStopTime = nextRow && nextRow[2] ? excelTimeToString(nextRow[2]) : '23:59:59';

  if (!programsByTitle[program]) {
    programsByTitle[program] = {};
  }
  if (!programsByTitle[program][formattedDate]) {
    programsByTitle[program][formattedDate] = [];
  }
  programsByTitle[program][formattedDate].push({
    startTime: formattedStartTime,
    stopTime: formattedStopTime
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