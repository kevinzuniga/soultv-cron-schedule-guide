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
    try {
      const jsDate = new Date((excelDate - 25569) * 86400 * 1000); // Ajuste del valor base de Excel
      const adjustedDate = addDays(jsDate, 1); // Ajustar la fecha sumando un día
      return format(adjustedDate, 'dd/MM/yyyy');
    } catch (error) {
      console.error(`Error formateando la fecha: ${excelDate}, error: ${error}`);
      return null;
    }
  } else {
    console.warn(`Valor no numérico encontrado en la celda de fecha: ${excelDate}. Fila omitida.`);
    return null;
  }
}

// Función para convertir el valor numérico de Excel a un formato de hora
function excelTimeToString(excelTime) {
  try {
    if (excelTime === undefined || excelTime === null || excelTime === '') return null;
    const time = parseFloat(excelTime);
    const totalMinutes = Math.round(time * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  } catch (error) {
    console.error(`Error formateando la hora: ${excelTime}, error: ${error}`);
    return null;
  }
}

try {
  const workbook = xlsx.readFile(filePath);
  console.log('Archivo cargado exitosamente.');

  let sheet = workbook.Sheets['Planilha1'];
  if (!sheet) {
    const sheetName = workbook.SheetNames[0];
    sheet = workbook.Sheets[sheetName];
    console.log(`"Planilha1" no encontrada. Usando la hoja activa: ${sheetName}`);
  }

  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`Datos cargados: ${data.length} filas.`);

  const diasSemana = ["SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO", "SABADO", "DOMINGO"];

  let startRow = 0;
  let startCol = -1;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    for (let j = 0; j < row.length; j++) {
      if (typeof row[j] === 'string' && diasSemana.includes(row[j].toUpperCase())) {
        startRow = i;
        startCol = j;
        break;
      }
    }
    if (startCol !== -1) {
      break;
    }
  }

  if (startCol === -1) {
    throw new Error('No se encontró una columna con un día de la semana en portugués.');
  }

  const programsByTitle = {};

  for (let i = startRow + 1; i < data.length; i++) {
    const row = data[i];

    if (row[startCol] === undefined || row[startCol + 1] === undefined || row[startCol + 2] === undefined || row[startCol + 3] === 'PROGRAMA') {
      console.log(`Fila ${i} omitida por datos incompletos.`);
      continue;
    }

    const [dayOfWeek, date, startTime, program, descriptionCandidate, classification] = row.slice(startCol, startCol + 6);

    if (program === 'PROGRAMA') {
      console.log(`Fila ${i} omitida por ser una cabecera 'PROGRAMA'.`);
      continue;
    }

    const formattedDate = excelDateToString(date);
    const formattedStartTime = excelTimeToString(startTime);

    if (!formattedStartTime || !formattedDate) {
      console.log(`Fila ${i} omitida por datos de tiempo o fecha inválidos.`);
      continue;
    }

    let description = descriptionCandidate || null;
    if (!description && i + 1 < data.length) {
      const nextRow = data[i + 1];
      if (nextRow[startCol + 4]) {
        description = nextRow[startCol + 4];
      }
    }

    let formattedStopTime = '23:59:59';
    const nextRow = data[i + 1];
    if (nextRow) {
      const nextDayOfWeek = nextRow[startCol];
      const nextDate = nextRow[startCol + 1];
      const nextStartTime = nextRow[startCol + 2];

      if (nextStartTime && nextStartTime !== 'PROGRAMA') {
        if (nextDayOfWeek === dayOfWeek) {
          formattedStopTime = excelTimeToString(nextStartTime);
        } else if (nextDate && formattedDate !== excelDateToString(nextDate)) {
          formattedStopTime = '23:59:59';
        }
      }
    }

    if (!programsByTitle[program]) {
      programsByTitle[program] = {
        description: description || "Sin descripción",
        days: {}
      };
    }
    if (!programsByTitle[program].days[formattedDate]) {
      programsByTitle[program].days[formattedDate] = [];
    }
    programsByTitle[program].days[formattedDate].push({
      startTime: formattedStartTime,
      stopTime: formattedStopTime
    });
  }

  const programsJson = Object.keys(programsByTitle).map(title => ({
    program: title,
    description: programsByTitle[title].description,
    days: programsByTitle[title].days
  }));

  fs.writeFile(outputFilePath, JSON.stringify(programsJson, null, 2), (err) => {
    if (err) throw err;
    console.log('Archivo JSON generado correctamente.');
  });
} catch (error) {
  console.error('Error en la ejecución del script principal:', error);
}