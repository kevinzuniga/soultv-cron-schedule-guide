const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');
const { addDays, format } = require('date-fns');

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

// Obtener el archivo de entrada de la línea de comandos
const filePath = process.argv[2];
if (!filePath) {
  console.error('Por favor, proporcione la ruta del archivo Excel como argumento.');
  process.exit(1);
}

console.log('filePath:', filePath);

// Generar la ruta del archivo de salida basado en el archivo de entrada
const outputFilePath = path.join('./tmp', path.basename(filePath, path.extname(filePath)) + '.json');

// Cargar el archivo Excel
const workbook = xlsx.readFile(filePath);

// Procesar cada pestaña del archivo Excel
const programsByTitle = {};

workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  // Obtener los nombres de las columnas
  const [header, ...rows] = data;

  rows.forEach(row => {
    if (!row || row.length === 0 || !row[0]) {
      return; // Saltar filas vacías
    }

    let date = row[0]; // La primera columna debe ser la fecha

    if (typeof date === 'number') {
      date = excelDateToString(date);
    }

    if (!date || typeof date !== 'string') {
      console.error(`Fila sin fecha válida: ${JSON.stringify(row)}`);
      return;
    }

    const [startTime, duration, program, description, classification, synopsis] = row.slice(1);

    if (typeof startTime === 'number' && typeof duration === 'number') {
      let formattedStartTime = excelTimeToString(startTime);
      const totalDurationMinutes = Math.round(duration * 24 * 60);
      let [startHour, startMinute] = formattedStartTime.split(':').map(Number);

      if (startHour === 24) {
        startHour = 0;
      }

      formattedStartTime = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}:00`;

      let stopHour = startHour + Math.floor((startMinute + totalDurationMinutes) / 60);
      let stopMinute = (startMinute + totalDurationMinutes) % 60;

      if (stopHour === 24) {
        stopHour = 0;
      } else {
        stopHour = stopHour % 24;
      }

      const formattedStopTime = `${stopHour.toString().padStart(2, '0')}:${stopMinute.toString().padStart(2, '0')}:00`;

      // Si no existe el programa en el objeto, crearlo y asignar la descripción
      if (!programsByTitle[program]) {
        programsByTitle[program] = {
          description: description || "Sin descripción",
          days: {}
        };
      }

      // Si no existe el día para ese programa, inicializarlo
      if (!programsByTitle[program].days[date]) {
        programsByTitle[program].days[date] = [];
      }

      // Agregar el horario de inicio y fin al programa en ese día
      programsByTitle[program].days[date].push({
        startTime: formattedStartTime,
        stopTime: formattedStopTime,
      });
    }
  });
});

// Convertir los datos a JSON
const programsJson = Object.keys(programsByTitle).map(title => ({
  program: title,
  description: programsByTitle[title].description, // Usar la descripción almacenada
  days: programsByTitle[title].days
}));

// Crear la carpeta de salida si no existe
const outputDir = path.dirname(outputFilePath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Guardar el JSON resultante en un archivo
fs.writeFile(outputFilePath, JSON.stringify(programsJson, null, 2), (err) => {
  if (err) throw err;
  console.log(`Archivo JSON generado correctamente en: ${outputFilePath}`);
});