const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { format, startOfWeek, addDays } = require('date-fns');

const filePath = process.argv[2];
console.log('filePath', filePath);
const outputFilePath = path.join('./tmp', path.basename(filePath, path.extname(filePath)) + '.json');

// Función para convertir el valor numérico de Excel a un formato de hora
function excelTimeToString(excelTime) {
  const totalMinutes = Math.round(excelTime * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
}

// Obtener la fecha actual y calcular el inicio de la semana (lunes)
const today = new Date();
const startDate = startOfWeek(today, { weekStartsOn: 1 }); // 1 significa que la semana empieza el lunes

// Calcular las fechas de cada día de la semana
const daysOfWeek = {
  'Segunda-feira': format(startDate, 'dd/MM/yyyy'),
  'Terça-feira': format(addDays(startDate, 1), 'dd/MM/yyyy'),
  'Quarta-feira': format(addDays(startDate, 2), 'dd/MM/yyyy'),
  'Quinta-feira': format(addDays(startDate, 3), 'dd/MM/yyyy'),
  'Sexta-feira': format(addDays(startDate, 4), 'dd/MM/yyyy'),
  'Sábado': format(addDays(startDate, 5), 'dd/MM/yyyy'),
  'Domingo': format(addDays(startDate, 6), 'dd/MM/yyyy')
};

// Cargar el archivo Excel
const workbook = xlsx.readFile(filePath);

// Procesar cada pestaña
const programsByTitle = {};

workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  // Obtener los nombres de las columnas
  const [header, ...rows] = data;

  rows.forEach(row => {
    const [startTime, duration, program, genre, classification, synopsis] = row;

    // Convertir el tiempo de inicio y la duración en un formato adecuado
    if (typeof startTime === 'number' && typeof duration === 'number') {
      const formattedStartTime = excelTimeToString(startTime);
      const totalDurationMinutes = Math.round(duration * 24 * 60);
      const [startHour, startMinute] = formattedStartTime.split(':').map(Number);
      const stopHour = startHour + Math.floor(totalDurationMinutes / 60);
      const stopMinute = (startMinute + totalDurationMinutes) % 60;
      const formattedStopTime = `${stopHour.toString().padStart(2, '0')}:${stopMinute.toString().padStart(2, '0')}:00`;

      const date = daysOfWeek[sheetName];
      if (!date) {
        console.error(`No se encontró la fecha para la pestaña: ${sheetName}`);
        return;
      }

      if (!programsByTitle[program]) {
        programsByTitle[program] = {};
      }
      if (!programsByTitle[program][date]) {
        programsByTitle[program][date] = [];
      }
      programsByTitle[program][date].push({
        startTime: formattedStartTime,
        stopTime: formattedStopTime
      });
    }
  });
});

const programsJson = Object.keys(programsByTitle).map(title => ({
  program: title,
  days: programsByTitle[title]
}));

// Guardar el JSON resultante en un archivo
console.log('outputFilePath', outputFilePath);
fs.writeFile(outputFilePath, JSON.stringify(programsJson, null, 2), (err) => {
  if (err) throw err;
  console.log('Archivo JSON generado correctamente.');
});