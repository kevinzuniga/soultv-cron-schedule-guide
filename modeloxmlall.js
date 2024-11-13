const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const parser = new xml2js.Parser();

const filePath = process.argv[2];
console.log('filePath', filePath);
const outputFilePath = path.join('./tmp', path.basename(filePath, path.extname(filePath)) + '.json');

// Función para formatear el tiempo del XML
function formatXmlTime(xmlTime) {
  const year = xmlTime.substring(0, 4);      // Año
  const month = xmlTime.substring(4, 6);     // Mes
  const day = xmlTime.substring(6, 8);       // Día
  const hour = xmlTime.substring(8, 10);     // Hora
  const minute = xmlTime.substring(10, 12);  // Minutos
  const second = xmlTime.substring(12, 14);  // Segundos

  return {
    date: `${day}/${month}/${year}`,             // Fecha en formato 'DD/MM/YYYY'
    time: `${hour}:${minute}:${second}`          // Hora en formato 'HH:MM:SS'
  };
}

// Leer el archivo XML
fs.readFile(filePath, (err, data) => {
  if (err) throw err;

  parser.parseString(data, (err, result) => {
    if (err) throw err;

    const programmes = result.tv.programme.flatMap(program => {
      const { date: programDate, time: startTime } = formatXmlTime(program.$.start); // Formatear fecha y hora de inicio
      const { time: stopTime } = formatXmlTime(program.$.stop);                      // Formatear hora de fin
      const xmlChannelId = program.$.channel;                                        // ID del canal en XML
      
      // Verificación de xmlChannelId
      console.log('xmlChannelId:', xmlChannelId);

      const title = program.title[0]._ || '';                                        // Título del programa
      const description = program.desc ? program.desc[0]._ : '';                     // Descripción del programa
      const image_url = program.icons && program.icons[0].$.src ? program.icons[0].$.src : ''; // URL de la imagen

      return [{
        channel_id: xmlChannelId,  // Usar xmlChannelId directamente como channel_id
        title,
        programDate,
        startTime,
        stopTime,
        description,
        image_url  // Añadir campo de imagen al resultado
      }];
    });

    // Agrupar los programas por título y día
    const programsByTitleAndDate = programmes.reduce((acc, program) => {
      let programEntry = acc.find(p => p.channel_id === program.channel_id && p.program === program.title);
      if (!programEntry) {
        programEntry = {
          channel_id: program.channel_id,
          program: program.title,
          description: program.description || "",  // Mover descripción al nivel superior
          image_url: program.image_url || "",  // Mover image_url al nivel superior
          days: {}
        };
        acc.push(programEntry);
      }
      
      // Añadir el programa al día correspondiente
      if (!programEntry.days[program.programDate]) {
        programEntry.days[program.programDate] = [];
      }
      programEntry.days[program.programDate].push({
        startTime: program.startTime,
        stopTime: program.stopTime
      });

      return acc;
    }, []);

    // Escribir el JSON de salida
    console.log('outputFilePath', outputFilePath);
    fs.writeFile(outputFilePath, JSON.stringify(programsByTitleAndDate, null, 2), (err) => {
      if (err) throw err;
      console.log('Archivo JSON generado correctamente.');
    });
  });
});