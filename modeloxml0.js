const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const parser = new xml2js.Parser();

const filePath = process.argv[2];
console.log('filePath', filePath);
const outputFilePath = path.join('./tmp', path.basename(filePath, path.extname(filePath)) + '.json');

// Función para convertir horas y minutos al formato decimal
function timeStringToDecimal(timeString) {
  const [hours, minutes, seconds] = timeString.split(':').map(Number);
  return (hours + minutes / 60 + seconds / 3600) / 24;
}

// Leer el archivo XML
fs.readFile(filePath, (err, data) => {
  if (err) throw err;

  parser.parseString(data, (err, result) => {
    if (err) throw err;

    const programmes = result.root.Coontent202209.map(program => {
      const date = program.Column1[0]; // Fecha en formato DD/MM/YYYY
      const dayOfWeek = program.Column2[0]; // Día de la semana (no se usará directamente)
      const startTime = program.Column3[0]; // Hora de inicio en formato HH:MM:SS
      const title = program.Column4[0]; // Título del programa
      const duration = program.Column5[0]; // Duración en formato HH:MM:SS
      const classification = program.Column6[0]; // Clasificación del programa
      const genre = program.Column7[0]; // Género del programa
      const description = program.Column9[0]; // Descripción del programa

      // Dividimos la fecha en partes (DD/MM/YYYY)
      const [day, month, year] = date.split('/');

      // Convertimos la fecha al formato deseado (DD/MM/YYYY)
      const formattedDate = `${day}/${month}/${year}`;

      // Convertimos la hora de inicio y la duración
      const formattedStartTime = startTime;
      const formattedStopTime = addTime(formattedStartTime, duration);

      return {
        title,
        date: formattedDate,
        startTime: formattedStartTime,
        stopTime: formattedStopTime,
        genre,
        classification,
        description
      };
    });

    // Agrupamos los programas por título y fecha
    const programsByTitle = programmes.reduce((acc, program) => {
      if (!acc[program.title]) {
        acc[program.title] = {};
      }
      if (!acc[program.title][program.date]) {
        acc[program.title][program.date] = [];
      }
      acc[program.title][program.date].push({
        startTime: program.startTime,
        stopTime: program.stopTime,
        genre: program.genre,
        classification: program.classification,
        description: program.description
      });
      return acc;
    }, {});

    const programsJson = Object.keys(programsByTitle).map(title => ({
      program: title,
      days: programsByTitle[title]
    }));

    console.log('outputFilePath', outputFilePath);
    fs.writeFile(outputFilePath, JSON.stringify(programsJson, null, 2), (err) => {
      if (err) throw err;
      console.log('Archivo JSON generado correctamente.');
    });
  });
});

// Función para sumar una duración a una hora inicial
function addTime(startTime, duration) {
  const [startHours, startMinutes, startSeconds] = startTime.split(':').map(Number);
  const [durationHours, durationMinutes, durationSeconds] = duration.split(':').map(Number);

  let totalSeconds = startSeconds + durationSeconds;
  let totalMinutes = startMinutes + durationMinutes + Math.floor(totalSeconds / 60);
  let totalHours = startHours + durationHours + Math.floor(totalMinutes / 60);

  totalSeconds = totalSeconds % 60;
  totalMinutes = totalMinutes % 60;
  totalHours = totalHours % 24; // Aseguramos que las horas no superen las 24

  return `${String(totalHours).padStart(2, '0')}:${String(totalMinutes).padStart(2, '0')}:${String(totalSeconds).padStart(2, '0')}`;
}