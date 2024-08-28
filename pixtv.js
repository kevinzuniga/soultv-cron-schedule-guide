const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const filePath = process.argv[2];
console.log('filePath', filePath);
const outputFilePath = path.join('./tmp', path.basename(filePath, path.extname(filePath)) + '.json');

const parser = new xml2js.Parser({ explicitArray: false });

// Función para leer y convertir el archivo XML a JSON
function convertXmlToJson(filePath, outputFilePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) throw err;

    parser.parseString(data, (err, result) => {
      if (err) throw err;

      const programsByTitle = {};

      // Recorrer los elementos Coontent202209, omitiendo el primer elemento que es la cabecera
      result.root.Coontent202209.slice(1).forEach(item => {
        const date = item.PIXTVHD;
        const startTime = item.Column3;
        const content = item.Column4;
        const duration = item.Column5;

        // Validaciones
        if (!date || !startTime || !content || !duration) {
          // console.log('Invalid item detected and skipped:', item);
          return;
        }

        const endTime = calculateEndTime(startTime, duration);

        if (!programsByTitle[content]) {
          programsByTitle[content] = {};
        }
        if (!programsByTitle[content][date]) {
          programsByTitle[content][date] = [];
        }
        programsByTitle[content][date].push({
          startTime: startTime,
          stopTime: endTime
        });
      });

      const programsJson = Object.keys(programsByTitle).map(title => ({
        program: title,
        days: programsByTitle[title]
      }));

      // Guardar el JSON resultante en un archivo
      fs.writeFile(outputFilePath, JSON.stringify(programsJson, null, 2), (err) => {
        if (err) throw err;
        console.log('Archivo JSON generado correctamente.');
      });
    });
  });
}

// Función para calcular la hora de fin a partir de la hora de inicio y la duración
function calculateEndTime(startTime, duration) {
  const [startHours, startMinutes, startSeconds] = startTime.split(':').map(Number);
  const [durationHours, durationMinutes, durationSeconds] = duration.split(':').map(Number);

  let endHours = startHours + durationHours;
  let endMinutes = startMinutes + durationMinutes;
  let endSeconds = startSeconds + durationSeconds;

  if (endSeconds >= 60) {
    endMinutes += Math.floor(endSeconds / 60);
    endSeconds = endSeconds % 60;
  }
  if (endMinutes >= 60) {
    endHours += Math.floor(endMinutes / 60);
    endMinutes = endMinutes % 60;
  }

  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}:${endSeconds.toString().padStart(2, '0')}`;
}

// Convertir el archivo XML a JSON
convertXmlToJson('PIX TV grade.xml', 'pixtv.json');