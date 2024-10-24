const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const parser = new xml2js.Parser();

const filePath = process.argv[2];
console.log('filePath', filePath);
const outputFilePath = path.join('./tmp', path.basename(filePath, path.extname(filePath)) + '.json');

// Función para convertir el tiempo de formato HH:MM:SS al formato decimal
function timeStringToDecimal(timeString) {
  const [hours, minutes, seconds] = timeString.split(':').map(Number);
  return (hours + minutes / 60 + seconds / 3600) / 24;
}

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

// Función para formatear el tiempo del XML
function formatXmlTime(xmlTime) {
  const year = xmlTime.substring(0, 4);      // Año
  const month = xmlTime.substring(4, 6);     // Mes
  const day = xmlTime.substring(6, 8);       // Día
  const hour = xmlTime.substring(8, 10);     // Hora
  const minute = xmlTime.substring(10, 12);  // Minutos
  const second = xmlTime.substring(12, 14);  // Segundos

  // Retornar en el formato 'YYYY-MM-DD HH:MM:SS'
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

// Leer el archivo XML
fs.readFile(filePath, (err, data) => {
  if (err) throw err;

  parser.parseString(data, (err, result) => {
    if (err) throw err;

    const programmes = result.tv.programme.map(program => {
      const startTime = formatXmlTime(program.$.start); // Formatear la hora de inicio
      const stopTime = formatXmlTime(program.$.stop);   // Formatear la hora de fin
      const channel = program.$.channel;               // Canal del programa
      const title = program.title[0]._ || '';          // Título del programa
      const description = program.desc ? program.desc[0]._ : ''; // Descripción del programa
      const genre = program.category ? program.category[0]._ : ''; // Género del programa
      const classification = program.rating ? program.rating[0].value[0] : ''; // Clasificación del programa

      return {
        title,
        startTime,
        stopTime,
        channel,
        genre,
        classification,
        description
      };
    });

    const programsByTitle = programmes.reduce((acc, program) => {
      if (!acc[program.title]) {
        acc[program.title] = {};
      }
      if (!acc[program.title][program.startTime]) {
        acc[program.title][program.startTime] = [];
      }
      acc[program.title][program.startTime].push({
        stopTime: program.stopTime,
        channel: program.channel,
        genre: program.genre,
        classification: program.classification,
        description: program.description
      });
      return acc;
    }, {});

    const programsJson = Object.keys(programsByTitle).map(title => ({
      program: title,
      times: programsByTitle[title]
    }));

    console.log('outputFilePath', outputFilePath);
    fs.writeFile(outputFilePath, JSON.stringify(programsJson, null, 2), (err) => {
      if (err) throw err;
      console.log('Archivo JSON generado correctamente.');
    });
  });
});