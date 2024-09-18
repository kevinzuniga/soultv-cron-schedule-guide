const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { format, addDays } = require('date-fns');

const filePath = process.argv[2];
console.log('filePath', filePath);
const outputFilePath = path.join('./tmp', path.basename(filePath, path.extname(filePath)) + '.json');

// Función para convertir el valor numérico de Excel a un formato de fecha
function excelDateToString(excelDate) {
  if (typeof excelDate === 'number') {
    const jsDate = new Date((excelDate - 25569) * 86400 * 1000); // Ajuste del valor base de Excel
    const adjustedDate = addDays(jsDate, 1); // Ajustar la fecha sumando un día
    return format(adjustedDate, 'dd/MM/yyyy');
  }
  return excelDate; // Si ya es una cadena, devolverla tal cual
}

// Función para convertir el valor numérico de Excel a un formato de hora
function excelTimeToString(excelTime) {
  if (typeof excelTime !== 'number') return null;
  if (excelTime === 1 || excelTime === 0) {
    return "00:00:00";  // Si es 1 o 0, representa las 00:00 horas del mismo día
  }

  const totalMinutes = Math.round(excelTime * 24 * 60); // Convertir la fracción del día a minutos
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Asegurarse de que las horas estén en el rango de 0 a 23
  if (hours >= 24) {
    hours = hours % 24;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
}

// Cargar el archivo Excel
const workbook = xlsx.readFile(filePath);

// Procesar la hoja "Planilha1"
let sheet = workbook.Sheets['Planilha1'];

// Si "Planilha1" no existe, usar la primera hoja activa
if (!sheet) {
  const sheetName = workbook.SheetNames[0]; // Toma la primera hoja en la lista de hojas
  sheet = workbook.Sheets[sheetName];
  console.log(`"Planilha1" no encontrada. Usando la hoja activa: ${sheetName}`);
}

const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

// Días de la semana en portugués
const diasSemana = ["SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO", "SABADO", "DOMINGO"];

let startCol = -1;

// Buscar la primera fila válida que contenga un día de la semana
for (let i = 0; i < data.length; i++) {
  const row = data[i];
  
  // Comprobamos si la fila contiene un día de la semana en la columna esperada
  for (let j = 0; j < row.length; j++) {
    if (typeof row[j] === 'string' && diasSemana.includes(row[j].toUpperCase())) {
      startCol = j;  // Establecer la columna donde se encuentra el día de la semana
      break;
    }
  }

  // Verificar si la fila contiene suficientes columnas con datos válidos (por ejemplo, hora, programa, etc.)
  if (startCol !== -1 && row[startCol + 1] && row[startCol + 2] && row[startCol + 3]) {
    console.log(`Fila de inicio detectada en la fila ${i} y columna ${startCol}`);
    break; // Salir del bucle cuando se encuentra la primera fila válida
  }
}

if (startCol === -1) {
  console.error('No se encontró una columna con un día de la semana en portugués.');
  process.exit(1);
}

const programsByTitle = {};

// Procesar desde la fila donde se detectaron los datos correctos
for (let i = 0; i < data.length; i++) {
  const row = data[i];

  // Verificar si esta fila es cabecera (como 'GRADE MENSAL CANAL ISTV', etc.) o contiene valores vacíos
  if (typeof row[startCol] !== 'string' || !diasSemana.includes(row[startCol].toUpperCase())) {
    console.log(`Fila ${i} omitida: parece ser una cabecera o no válida`);
    continue;
  }

  // Verificar que la fila tenga las columnas necesarias
  if (typeof row[startCol + 1] !== 'number' || typeof row[startCol + 2] !== 'number' || !row[startCol + 3]) {
    console.log(`Fila ${i} omitida: no tiene suficientes datos válidos`);
    continue;
  }

  const [dayOfWeek, date, startTime, program, genre, classification] = row.slice(startCol, startCol + 6);

  // Saltar las filas que tienen "PROGRAMA" en la columna del nombre del programa
  if (program === 'PROGRAMA') {
    console.log(`Fila ${i} omitida: es una fila de cabecera 'PROGRAMA'`);
    continue;
  }

  const formattedDate = excelDateToString(date);
  const formattedStartTime = excelTimeToString(startTime);

  // Asegurarse de que el tiempo de inicio sea válido (aunque sea 00:00)
  if (!formattedStartTime) {
    console.log(`Fila ${i} omitida: el tiempo de inicio no es válido`);
    continue;
  }

  // Determinar el fin del programa
  let formattedStopTime = '23:59:59'; // Por defecto, el fin del programa es el final del día
  const nextRow = data[i + 1];
  
  if (nextRow) {
    const nextDayOfWeek = nextRow[startCol];
    const nextDate = nextRow[startCol + 1];
    const nextStartTime = nextRow[startCol + 2];

    if (nextStartTime && nextStartTime !== 'PROGRAMA') {
      if (nextDayOfWeek === dayOfWeek) {
        formattedStopTime = excelTimeToString(nextStartTime);
      } else if (nextDate && formattedDate !== excelDateToString(nextDate)) {
        formattedStopTime = '23:59:59'; // Si el siguiente programa es en un día diferente, terminar a las 23:59:59
      }
    }
  }

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