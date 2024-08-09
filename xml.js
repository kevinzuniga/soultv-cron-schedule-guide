const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const parser = new xml2js.Parser();

const filePath = process.argv[2];
console.log('filePath', filePath);
const outputFilePath = path.join('./tmp', path.basename(filePath, path.extname(filePath)) + '.json');

fs.readFile(filePath, (err, data) => {
  if (err) throw err;

  parser.parseString(data, (err, result) => {
    if (err) throw err;

    const programmes = result.tv.programme.map(program => {
      const start = program.$.start;
      const stop = program.$.stop;
      const title = program.title[0]._ || program.title[0];

      // Extraemos la fecha y la hora de inicio y fin
      const startDate = start.substring(0, 8); // YYYYMMDD
      const startTime = start.substring(8, 14); // hhmmss
      const stopTime = stop.substring(8, 14); // hhmmss

      // Convertimos las fechas y horas al formato deseado
      const formattedDate = `${startDate.substring(6, 8)}/${startDate.substring(4, 6)}/${startDate.substring(0, 4)}`;
      const formattedStartTime = `${startTime.substring(0, 2)}:${startTime.substring(2, 4)}:${startTime.substring(4, 6)}`;
      const formattedStopTime = `${stopTime.substring(0, 2)}:${stopTime.substring(2, 4)}:${stopTime.substring(4, 6)}`;

      return {
        title,
        date: formattedDate,
        startTime: formattedStartTime,
        stopTime: formattedStopTime
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
        stopTime: program.stopTime
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